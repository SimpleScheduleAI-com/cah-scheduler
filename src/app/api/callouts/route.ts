import { db } from "@/db";
import {
  callout,
  assignment,
  staff,
  shift,
  shiftDefinition,
} from "@/db/schema";
import { eq, aliasedTable } from "drizzle-orm";
import { NextResponse } from "next/server";
import { syncHolidayRowsForShifts } from "@/lib/holidays/holiday-tracking";
import { logAuditEvent } from "@/lib/audit/logger";
import { getEscalationOptions } from "@/lib/callout/escalation";

const replacementStaffAlias = aliasedTable(staff, "replacement_staff");

export async function GET() {
  const callouts = db
    .select({
      id: callout.id,
      assignmentId: callout.assignmentId,
      staffId: callout.staffId,
      shiftId: callout.shiftId,
      reason: callout.reason,
      reasonDetail: callout.reasonDetail,
      calledOutAt: callout.calledOutAt,
      replacementStaffId: callout.replacementStaffId,
      replacementSource: callout.replacementSource,
      status: callout.status,
      resolvedAt: callout.resolvedAt,
      resolvedBy: callout.resolvedBy,
      escalationStepsTaken: callout.escalationStepsTaken,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      replacementFirstName: replacementStaffAlias.firstName,
      replacementLastName: replacementStaffAlias.lastName,
      shiftDate: shift.date,
      shiftName: shiftDefinition.name,
    })
    .from(callout)
    .innerJoin(staff, eq(callout.staffId, staff.id))
    .leftJoin(
      replacementStaffAlias,
      eq(callout.replacementStaffId, replacementStaffAlias.id),
    )
    .innerJoin(shift, eq(callout.shiftId, shift.id))
    .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
    .orderBy(callout.createdAt)
    .all();

  return NextResponse.json(callouts);
}

export async function POST(request: Request) {
  const body = await request.json();

  // Nurses cannot write callouts at all (founder direction 2026-08-15): every
  // nurse-initiated absence is a TIME-OFF REQUEST that must pass the manager's
  // Leave queue — nothing a nurse submits may flip an assignment to called_out
  // without approval. Logging a callout is a manager action (e.g. recording a
  // phone call-in). The nurse portal now submits to /api/staff-leave instead.
  const role = request.headers.get("x-user-role");
  if (role === "nurse") {
    return NextResponse.json(
      {
        error:
          "Callouts are logged by your manager. Submit a time-off request from your schedule instead — your manager approves it and coverage is arranged.",
      },
      { status: 403 },
    );
  }

  // Update the assignment status. A called-out nurse no longer works the
  // shift, so if it is a holiday her annual holiday credit goes with it.
  db.transaction(() => {
    db.update(assignment)
      .set({ status: "called_out", updatedAt: new Date().toISOString() })
      .where(eq(assignment.id, body.assignmentId))
      .run();
    syncHolidayRowsForShifts([body.shiftId]);
  });

  const newCallout = db
    .insert(callout)
    .values({
      assignmentId: body.assignmentId,
      staffId: body.staffId,
      shiftId: body.shiftId,
      reason: body.reason,
      reasonDetail: body.reasonDetail || null,
      status: "open",
    })
    .returning()
    .get();

  const calledOutStaff = db
    .select({ firstName: staff.firstName, lastName: staff.lastName })
    .from(staff)
    .where(eq(staff.id, body.staffId))
    .get();
  const calledOutName = calledOutStaff
    ? `${calledOutStaff.firstName} ${calledOutStaff.lastName}`
    : body.staffId;

  const reasonDetailSuffix = body.reasonDetail
    ? ` — Detail: ${body.reasonDetail}`
    : "";
  logAuditEvent({
    entityType: "callout",
    entityId: newCallout.id,
    action: "callout_logged",
    description: `Callout logged for ${calledOutName} (${body.reason})${reasonDetailSuffix}`,
    newState: newCallout as unknown as Record<string, unknown>,
  });

  // Was the called-out assignment a charge nurse slot?
  const origAssignment = db
    .select({ isChargeNurse: assignment.isChargeNurse })
    .from(assignment)
    .where(eq(assignment.id, body.assignmentId))
    .get();
  const chargeNurseRequired = origAssignment?.isChargeNurse === true;

  // Get escalation options (competency-ranked, top 3 + up to 3 ineligible)
  const options = getEscalationOptions(body.shiftId, body.staffId);

  return NextResponse.json(
    { callout: newCallout, escalationOptions: options, chargeNurseRequired },
    { status: 201 },
  );
}
