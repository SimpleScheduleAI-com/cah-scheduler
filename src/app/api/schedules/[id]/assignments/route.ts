import { db } from "@/db";
import {
  assignment,
  schedule,
  shift,
  shiftDefinition,
  staff,
  publicHoliday,
  staffHolidayAssignment,
} from "@/db/schema";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/logger";
import { describeStaffing } from "@/lib/audit/staffing-context";
import { weekBounds } from "@/lib/date/week";
import { notification } from "@/db/schema";
import {
  insertNotification,
  composeAssignmentAmended,
} from "@/lib/notifications/notify";

/**
 * Post-publish amendments. A published schedule is the version of record
 * nurses have seen, and once seen "unpublishing" has no real-world meaning —
 * a one-person change is an amendment, not a new schedule. Amendments are
 * allowed, but must carry a reason, are logged against the SCHEDULE as
 * `post_publish_amendment` (so the schedule's history reads as "what changed
 * after publish"), and notify only the affected nurse. Wholesale rework still
 * goes through unpublish (see PUT /api/schedules/[id]).
 */
function amendmentReason(raw: unknown): string | null {
  const r = typeof raw === "string" ? raw.trim() : "";
  return r.length > 0 ? r : null;
}

const AMENDMENT_REASON_REQUIRED =
  "This schedule is published. Give a reason for the change — it is recorded in the audit trail and shown to the affected nurse.";

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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: scheduleId } = await params;
  const body = await request.json();

  // Changes to a published schedule are amendments: allowed, but only with a
  // reason (audit trail + the affected nurse's notification).
  const scheduleRecord = db
    .select()
    .from(schedule)
    .where(eq(schedule.id, scheduleId))
    .get();
  const isPublished = scheduleRecord?.status === "published";
  const reason = amendmentReason(body.reason);
  if (isPublished && !reason) {
    return NextResponse.json(
      { error: AMENDMENT_REASON_REQUIRED },
      { status: 400 },
    );
  }

  // Look up the shift up front — needed to compute isOvertime and for holiday tracking below
  const shiftRecord = db
    .select()
    .from(shift)
    .where(eq(shift.id, body.shiftId))
    .get();

  // Compute isOvertime: sum hours already assigned to this staff member in the same
  // calendar week, then check if adding this shift would push them over 40h.
  // The client never sends a reliable isOvertime value (it doesn't track weekly state),
  // so we always compute it here from the current DB state.
  // durationHours lives on shiftDefinition, so queries join through that table.
  let isOvertime = false;
  let shiftDef:
    { durationHours: number; name: string; shiftType: string } | undefined;
  if (shiftRecord) {
    shiftDef = db
      .select({
        durationHours: shiftDefinition.durationHours,
        name: shiftDefinition.name,
        shiftType: shiftDefinition.shiftType,
      })
      .from(shiftDefinition)
      .where(eq(shiftDefinition.id, shiftRecord.shiftDefinitionId))
      .get();
    const shiftDuration = shiftDef?.durationHours ?? 0;

    const { weekStart, weekEnd } = weekBounds(shiftRecord.date);

    const existingRows = db
      .select({ durationHours: shiftDefinition.durationHours })
      .from(assignment)
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .innerJoin(
        shiftDefinition,
        eq(shift.shiftDefinitionId, shiftDefinition.id),
      )
      .where(
        and(
          eq(assignment.staffId, body.staffId),
          gte(shift.date, weekStart),
          lte(shift.date, weekEnd),
          // Hours the nurse is no longer working must not count toward OT —
          // matches the filters used by swap approval and find-candidates.
          ne(assignment.status, "called_out"),
          ne(assignment.status, "cancelled"),
          ne(assignment.status, "swapped"),
        ),
      )
      .all();

    const weeklyHours = existingRows.reduce(
      (sum, r) => sum + r.durationHours,
      0,
    );
    isOvertime = weeklyHours + shiftDuration > 40;
  }

  // When assigning a new charge nurse, demote any existing charge assignments on
  // the same shift. A shift should have at most one charge nurse; the new
  // assignment supersedes any previous (possibly invalid) charge designation.
  if (body.isChargeNurse) {
    db.update(assignment)
      .set({ isChargeNurse: false })
      .where(
        and(
          eq(assignment.shiftId, body.shiftId),
          eq(assignment.isChargeNurse, true),
        ),
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

  const staffRecord = db
    .select({
      firstName: staff.firstName,
      lastName: staff.lastName,
      role: staff.role,
    })
    .from(staff)
    .where(eq(staff.id, body.staffId))
    .get();
  const staffName = staffRecord
    ? `${staffRecord.firstName} ${staffRecord.lastName}`
    : body.staffId;
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

  if (isPublished && reason && scheduleRecord) {
    logAuditEvent({
      entityType: "schedule",
      entityId: scheduleId,
      action: "post_publish_amendment",
      description: `Amended published schedule "${scheduleRecord.name}": added ${staffName} to ${shiftLabel}${body.isChargeNurse ? " (charge nurse)" : ""} — ${reason}`,
      justification: reason,
      newState: {
        change: "added",
        assignmentId: newAssignment.id,
        staffId: body.staffId,
        shiftId: body.shiftId,
        shiftDate: shiftRecord?.date ?? null,
      },
    });
    try {
      insertNotification(
        db,
        notification,
        composeAssignmentAmended({
          staffId: body.staffId,
          change: "added",
          date: shiftRecord?.date ?? "",
          shiftLabel: shiftDef?.name ?? shiftDef?.shiftType ?? "Shift",
          unit: scheduleRecord.unit,
          reason,
        }),
      );
    } catch (err) {
      console.error("[notify] assignment_amended (added) failed", err);
    }
  }

  // Track holiday assignment for annual fairness — shiftRecord already fetched above
  if (shiftRecord) {
    const holidayRecord = db
      .select()
      .from(publicHoliday)
      .where(
        and(
          eq(publicHoliday.date, shiftRecord.date),
          eq(publicHoliday.isActive, true),
        ),
      )
      .get();

    if (holidayRecord) {
      const logicalHolidayName = getLogicalHolidayName(holidayRecord.name);
      // Parse year from the string: Date().getFullYear() returns the previous
      // year for Jan 1 dates on servers west of UTC.
      const year = parseInt(shiftRecord.date.slice(0, 4), 10);

      // Check if we already have a record for this staff/holiday/year
      const existing = db
        .select()
        .from(staffHolidayAssignment)
        .where(
          and(
            eq(staffHolidayAssignment.staffId, body.staffId),
            eq(staffHolidayAssignment.holidayName, logicalHolidayName),
            eq(staffHolidayAssignment.year, year),
          ),
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
    return NextResponse.json(
      { error: "assignmentId required" },
      { status: 400 },
    );
  }

  const existing = db
    .select()
    .from(assignment)
    .where(eq(assignment.id, assignmentId))
    .get();

  // Same amendment rule as POST: removals from a published schedule need a
  // reason (?reason=...), are logged, and notify the removed nurse.
  const owningSchedule = existing
    ? db
        .select()
        .from(schedule)
        .where(eq(schedule.id, existing.scheduleId))
        .get()
    : undefined;
  const isPublished = owningSchedule?.status === "published";
  const reason = amendmentReason(searchParams.get("reason"));
  if (isPublished && !reason) {
    return NextResponse.json(
      { error: AMENDMENT_REASON_REQUIRED },
      { status: 400 },
    );
  }

  // Clean up holiday tracking if this was a holiday assignment
  if (existing) {
    const shiftRecord = db
      .select()
      .from(shift)
      .where(eq(shift.id, existing.shiftId))
      .get();
    if (shiftRecord) {
      const holidayRecord = db
        .select()
        .from(publicHoliday)
        .where(
          and(
            eq(publicHoliday.date, shiftRecord.date),
            eq(publicHoliday.isActive, true),
          ),
        )
        .get();

      if (holidayRecord) {
        const logicalHolidayName = getLogicalHolidayName(holidayRecord.name);
        // Parse year from the string: Date().getFullYear() returns the previous
        // year for Jan 1 dates on servers west of UTC.
        const year = parseInt(shiftRecord.date.slice(0, 4), 10);

        // Delete the holiday tracking record
        db.delete(staffHolidayAssignment)
          .where(
            and(
              eq(staffHolidayAssignment.staffId, existing.staffId),
              eq(staffHolidayAssignment.holidayName, logicalHolidayName),
              eq(staffHolidayAssignment.year, year),
            ),
          )
          .run();
      }
    }
  }

  db.delete(assignment).where(eq(assignment.id, assignmentId)).run();

  if (existing) {
    const delStaff = db
      .select({ firstName: staff.firstName, lastName: staff.lastName })
      .from(staff)
      .where(eq(staff.id, existing.staffId))
      .get();
    const delStaffName = delStaff
      ? `${delStaff.firstName} ${delStaff.lastName}`
      : existing.staffId;
    const delShiftRecord = db
      .select()
      .from(shift)
      .where(eq(shift.id, existing.shiftId))
      .get();
    const delShiftDef = delShiftRecord
      ? db
          .select({
            name: shiftDefinition.name,
            shiftType: shiftDefinition.shiftType,
          })
          .from(shiftDefinition)
          .where(eq(shiftDefinition.id, delShiftRecord.shiftDefinitionId))
          .get()
      : null;
    const delShiftLabel = delShiftRecord
      ? `${delShiftDef?.name ?? delShiftDef?.shiftType ?? "shift"} on ${delShiftRecord.date}`
      : existing.shiftId;

    // Staffing position AFTER removal, so the trail shows whether this took the
    // shift back to requirement (e.g. a low-census release) or left it short.
    const postRemovalStaffing = describeStaffing(existing.shiftId);

    logAuditEvent({
      entityType: "assignment",
      entityId: assignmentId,
      action: "deleted",
      description: `Removed ${delStaffName} from ${delShiftLabel}${postRemovalStaffing}`,
      previousState: existing as unknown as Record<string, unknown>,
    });

    if (isPublished && reason && owningSchedule) {
      logAuditEvent({
        entityType: "schedule",
        entityId: owningSchedule.id,
        action: "post_publish_amendment",
        description: `Amended published schedule "${owningSchedule.name}": removed ${delStaffName} from ${delShiftLabel} — ${reason}${postRemovalStaffing}`,
        justification: reason,
        previousState: {
          change: "removed",
          assignmentId,
          staffId: existing.staffId,
          shiftId: existing.shiftId,
          shiftDate: delShiftRecord?.date ?? null,
        },
      });
      try {
        insertNotification(
          db,
          notification,
          composeAssignmentAmended({
            staffId: existing.staffId,
            change: "removed",
            date: delShiftRecord?.date ?? "",
            shiftLabel: delShiftDef?.name ?? delShiftDef?.shiftType ?? "Shift",
            unit: owningSchedule.unit,
            reason,
          }),
        );
      } catch (err) {
        console.error("[notify] assignment_amended (removed) failed", err);
      }
    }
  }

  return NextResponse.json({ success: true });
}
