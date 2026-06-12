import { db } from "@/db";
import { assignment, schedule, shift, shiftDefinition, staff, publicHoliday, staffHolidayAssignment } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/logger";
import { getWeekStart } from "@/lib/engine/scheduler/state";

/**
 * Holiday groups - maps individual holiday names to logical holiday groups.
 * Working either Christmas Eve OR Christmas Day counts as "worked Christmas".
 */
const HOLIDAY_GROUPS: Record<string, string> = {
  "Christmas Eve": "Christmas",
  "Christmas Day": "Christmas",
};

function getLogicalHolidayName(holidayName: string): string {
  return HOLIDAY_GROUPS[holidayName] ?? holidayName;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: scheduleId } = await params;
  const body = await request.json();

  // A published schedule is the version of record staff were notified about.
  // Mutating it directly would desynchronize what staff saw from what the
  // system stores — require an explicit unpublish first.
  const scheduleRecord = db.select().from(schedule).where(eq(schedule.id, scheduleId)).get();
  if (scheduleRecord?.status === "published") {
    return NextResponse.json(
      { error: "Cannot modify assignments on a published schedule. Unpublish it first to make changes." },
      { status: 409 }
    );
  }

  // Look up the shift up front — needed to compute isOvertime and for holiday tracking below
  const shiftRecord = db.select().from(shift).where(eq(shift.id, body.shiftId)).get();

  // Compute isOvertime: sum hours already assigned to this staff member in the same
  // calendar week, then check if adding this shift would push them over 40h.
  // The client never sends a reliable isOvertime value (it doesn't track weekly state),
  // so we always compute it here from the current DB state.
  // durationHours lives on shiftDefinition, so queries join through that table.
  let isOvertime = false;
  let shiftDef: { durationHours: number; name: string; shiftType: string } | undefined;
  if (shiftRecord) {
    shiftDef = db
      .select({ durationHours: shiftDefinition.durationHours, name: shiftDefinition.name, shiftType: shiftDefinition.shiftType })
      .from(shiftDefinition)
      .where(eq(shiftDefinition.id, shiftRecord.shiftDefinitionId))
      .get();
    const shiftDuration = shiftDef?.durationHours ?? 0;

    const weekStart = getWeekStart(shiftRecord.date);
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);

    const existingRows = db
      .select({ durationHours: shiftDefinition.durationHours })
      .from(assignment)
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
      .where(
        and(
          eq(assignment.staffId, body.staffId),
          gte(shift.date, weekStart),
          lte(shift.date, weekEnd)
        )
      )
      .all();

    const weeklyHours = existingRows.reduce((sum, r) => sum + r.durationHours, 0);
    isOvertime = weeklyHours + shiftDuration > 40;
  }

  // When assigning a new charge nurse, demote any existing charge assignments on
  // the same shift. A shift should have at most one charge nurse; the new
  // assignment supersedes any previous (possibly invalid) charge designation.
  if (body.isChargeNurse) {
    db.update(assignment)
      .set({ isChargeNurse: false })
      .where(
        and(eq(assignment.shiftId, body.shiftId), eq(assignment.isChargeNurse, true))
      )
      .run();
  }

  const newAssignment = db
    .insert(assignment)
    .values({
      shiftId: body.shiftId,
      staffId: body.staffId,
      scheduleId,
      isChargeNurse: body.isChargeNurse ?? false,
      isOvertime,
      assignmentSource: body.assignmentSource ?? "manual",
      safeHarborInvoked: body.safeHarborInvoked ?? false,
      safeHarborFormId: body.safeHarborFormId || null,
      isFloat: body.isFloat ?? false,
      floatFromUnit: body.floatFromUnit || null,
      agencyReason: body.agencyReason || null,
      notes: body.notes || null,
    })
    .returning()
    .get();

  const staffRecord = db.select({ firstName: staff.firstName, lastName: staff.lastName, role: staff.role })
    .from(staff).where(eq(staff.id, body.staffId)).get();
  const staffName = staffRecord ? `${staffRecord.firstName} ${staffRecord.lastName}` : body.staffId;
  const shiftLabel = shiftRecord
    ? `${shiftDef?.name ?? shiftDef?.shiftType ?? "shift"} on ${shiftRecord.date}`
    : body.shiftId;

  logAuditEvent({
    entityType: "assignment",
    entityId: newAssignment.id,
    action: "manual_assignment",
    description: `Assigned ${staffName} to ${shiftLabel}${body.isChargeNurse ? " (charge nurse)" : ""}`,
    newState: newAssignment as unknown as Record<string, unknown>,
  });

  // Track holiday assignment for annual fairness — shiftRecord already fetched above
  if (shiftRecord) {
    const holidayRecord = db
      .select()
      .from(publicHoliday)
      .where(and(eq(publicHoliday.date, shiftRecord.date), eq(publicHoliday.isActive, true)))
      .get();

    if (holidayRecord) {
      const logicalHolidayName = getLogicalHolidayName(holidayRecord.name);
      const year = new Date(shiftRecord.date).getFullYear();

      // Check if we already have a record for this staff/holiday/year
      const existing = db
        .select()
        .from(staffHolidayAssignment)
        .where(
          and(
            eq(staffHolidayAssignment.staffId, body.staffId),
            eq(staffHolidayAssignment.holidayName, logicalHolidayName),
            eq(staffHolidayAssignment.year, year)
          )
        )
        .get();

      // Only insert if no existing record (to prevent duplicates for Christmas Eve/Day)
      if (!existing) {
        db.insert(staffHolidayAssignment)
          .values({
            staffId: body.staffId,
            holidayName: logicalHolidayName,
            year,
            shiftId: body.shiftId,
            assignmentId: newAssignment.id,
          })
          .run();
      }
    }
  }

  return NextResponse.json(newAssignment, { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const assignmentId = searchParams.get("assignmentId");

  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
  }

  const existing = db
    .select()
    .from(assignment)
    .where(eq(assignment.id, assignmentId))
    .get();

  // Same published-schedule guard as POST: removals on the version of record
  // must go through unpublish first.
  if (existing) {
    const owningSchedule = db
      .select()
      .from(schedule)
      .where(eq(schedule.id, existing.scheduleId))
      .get();
    if (owningSchedule?.status === "published") {
      return NextResponse.json(
        { error: "Cannot modify assignments on a published schedule. Unpublish it first to make changes." },
        { status: 409 }
      );
    }
  }

  // Clean up holiday tracking if this was a holiday assignment
  if (existing) {
    const shiftRecord = db.select().from(shift).where(eq(shift.id, existing.shiftId)).get();
    if (shiftRecord) {
      const holidayRecord = db
        .select()
        .from(publicHoliday)
        .where(and(eq(publicHoliday.date, shiftRecord.date), eq(publicHoliday.isActive, true)))
        .get();

      if (holidayRecord) {
        const logicalHolidayName = getLogicalHolidayName(holidayRecord.name);
        const year = new Date(shiftRecord.date).getFullYear();

        // Delete the holiday tracking record
        db.delete(staffHolidayAssignment)
          .where(
            and(
              eq(staffHolidayAssignment.staffId, existing.staffId),
              eq(staffHolidayAssignment.holidayName, logicalHolidayName),
              eq(staffHolidayAssignment.year, year)
            )
          )
          .run();
      }
    }
  }

  db.delete(assignment).where(eq(assignment.id, assignmentId)).run();

  if (existing) {
    const delStaff = db.select({ firstName: staff.firstName, lastName: staff.lastName })
      .from(staff).where(eq(staff.id, existing.staffId)).get();
    const delStaffName = delStaff ? `${delStaff.firstName} ${delStaff.lastName}` : existing.staffId;
    const delShiftRecord = db.select().from(shift).where(eq(shift.id, existing.shiftId)).get();
    const delShiftDef = delShiftRecord
      ? db.select({ name: shiftDefinition.name, shiftType: shiftDefinition.shiftType })
          .from(shiftDefinition).where(eq(shiftDefinition.id, delShiftRecord.shiftDefinitionId)).get()
      : null;
    const delShiftLabel = delShiftRecord
      ? `${delShiftDef?.name ?? delShiftDef?.shiftType ?? "shift"} on ${delShiftRecord.date}`
      : existing.shiftId;

    logAuditEvent({
      entityType: "assignment",
      entityId: assignmentId,
      action: "deleted",
      description: `Removed ${delStaffName} from ${delShiftLabel}`,
      previousState: existing as unknown as Record<string, unknown>,
    });
  }

  return NextResponse.json({ success: true });
}
