import { db } from "@/db";
import { callout, assignment, shift, shiftDefinition, schedule, staff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/logger";
import { getEscalationOptions } from "@/lib/callout/escalation";
import { checkStaffAvailability } from "@/lib/coverage/find-candidates";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const c = db.select().from(callout).where(eq(callout.id, id)).get();

  if (!c) {
    return NextResponse.json({ error: "Callout not found" }, { status: 404 });
  }

  // Compute escalation options so callers can open the replacement dialog
  // for an existing open callout without having to re-POST.
  const escalationOptions = getEscalationOptions(c.shiftId, c.staffId);
  const origAssignment = c.assignmentId
    ? db.select({ isChargeNurse: assignment.isChargeNurse })
        .from(assignment)
        .where(eq(assignment.id, c.assignmentId))
        .get()
    : null;
  const chargeNurseRequired = origAssignment?.isChargeNurse === true;

  return NextResponse.json({ ...c, escalationOptions, chargeNurseRequired });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  // Re-run the availability hard checks for the replacement at the moment of
  // fill, BEFORE any state is mutated. The escalation options shown to the
  // manager may be stale — the nurse may have gained a conflicting assignment
  // (overlap, rest hours, 60h cap, leave) since the dialog was opened.
  if (body.replacementStaffId) {
    const existingCallout = db.select().from(callout).where(eq(callout.id, id)).get();
    if (!existingCallout) {
      return NextResponse.json({ error: "Callout not found" }, { status: 404 });
    }
    const details = db
      .select({
        date: shift.date,
        startTime: shiftDefinition.startTime,
        endTime: shiftDefinition.endTime,
        durationHours: shiftDefinition.durationHours,
        unit: shiftDefinition.unit,
        shiftType: shiftDefinition.shiftType,
        scheduleId: shift.scheduleId,
      })
      .from(shift)
      .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
      .where(eq(shift.id, existingCallout.shiftId))
      .get();
    if (details) {
      const availability = await checkStaffAvailability(body.replacementStaffId, {
        id: existingCallout.shiftId,
        ...details,
      });
      if (!availability.available) {
        return NextResponse.json(
          {
            error: `Cannot fill: staff member no longer passes hard rules — ${availability.reason ?? "unavailable"}.`,
          },
          { status: 422 }
        );
      }
    }
  }

  const updated = db
    .update(callout)
    .set({
      replacementStaffId: body.replacementStaffId,
      replacementSource: body.replacementSource,
      status: body.status ?? "filled",
      resolvedAt: new Date().toISOString(),
      resolvedBy: body.resolvedBy ?? "nurse_manager",
      escalationStepsTaken: body.escalationStepsTaken,
    })
    .where(eq(callout.id, id))
    .returning()
    .get();

  if (!updated) {
    return NextResponse.json({ error: "Callout not found" }, { status: 404 });
  }

  // Ensure the called-out nurse's original assignment is hidden from the grid.
  // POST /api/callouts already sets this when the callout is first logged, but
  // setting it again here is defensive — covers leave-based or direct-API flows
  // where the original assignment status may not have been updated yet.
  // Also read isChargeNurse before the update so we can inherit it for the replacement.
  let originalWasCharge = false;
  if (updated.assignmentId) {
    const orig = db.select({ isChargeNurse: assignment.isChargeNurse })
      .from(assignment)
      .where(eq(assignment.id, updated.assignmentId))
      .get();
    originalWasCharge = orig?.isChargeNurse === true;

    db.update(assignment)
      .set({ status: "called_out", updatedAt: new Date().toISOString() })
      .where(eq(assignment.id, updated.assignmentId))
      .run();
  }

  // Create a replacement assignment so the grid shows the new nurse.
  // If the called-out nurse held the charge role, inherit it for the replacement
  // so the shift doesn't immediately gain a "Charge Nurse Required" hard violation.
  // Look up replacement staff name once for use in audit descriptions
  const replacementStaffRecord = body.replacementStaffId
    ? db.select({ firstName: staff.firstName, lastName: staff.lastName })
        .from(staff).where(eq(staff.id, body.replacementStaffId)).get()
    : null;
  const replacementName = replacementStaffRecord
    ? `${replacementStaffRecord.firstName} ${replacementStaffRecord.lastName}`
    : body.replacementStaffId;

  if (body.replacementStaffId && updated.shiftId) {
    const shiftRecord = db
      .select({ scheduleId: shift.scheduleId, date: shift.date })
      .from(shift)
      .where(eq(shift.id, updated.shiftId))
      .get();

    if (shiftRecord) {
      const schedRecord = db
        .select({ unit: schedule.unit })
        .from(schedule)
        .where(eq(schedule.id, shiftRecord.scheduleId))
        .get();

      const replacementStaff = db
        .select({ homeUnit: staff.homeUnit })
        .from(staff)
        .where(eq(staff.id, body.replacementStaffId))
        .get();

      const shiftUnit = schedRecord?.unit ?? "ICU";
      const staffHomeUnit = replacementStaff?.homeUnit ?? "ICU";
      const isFloat = staffHomeUnit !== shiftUnit;

      // Wrap in try-catch to guard against the UNIQUE(shiftId, staffId) constraint
      // on the assignment table. If the replacement is already assigned to this shift
      // (e.g. double-submit, or edge case from the schedule), we skip the duplicate
      // insert but still fall through to write the callout_filled audit event below.
      try {
        db.insert(assignment)
          .values({
            shiftId: updated.shiftId,
            staffId: body.replacementStaffId,
            scheduleId: shiftRecord.scheduleId,
            status: "assigned",
            assignmentSource: "callout_replacement",
            isFloat,
            floatFromUnit: isFloat ? staffHomeUnit : null,
            isChargeNurse: originalWasCharge,
            isOvertime: body.replacementSource === "overtime",
          })
          .run();

        logAuditEvent({
          entityType: "assignment",
          entityId: body.replacementStaffId,
          action: "manual_assignment",
          description: `Replacement assignment created: ${replacementName} assigned to shift on ${shiftRecord.date}`,
          newState: { shiftId: updated.shiftId, assignmentSource: "callout_replacement" },
        });
      } catch {
        // UNIQUE constraint: replacement already assigned to this shift.
        // Skip the duplicate insert — callout_filled is still written below.
      }
    }
  }

  const sourceLabel = body.replacementSource ?? "unknown";
  logAuditEvent({
    entityType: "callout",
    entityId: id,
    action: "callout_filled",
    description: `Callout filled — ${replacementName} assigned via ${sourceLabel}`,
    newState: updated as unknown as Record<string, unknown>,
  });

  return NextResponse.json(updated);
}
