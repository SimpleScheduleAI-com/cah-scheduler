import { db } from "@/db";
import {
  shiftSwapRequest,
  assignment,
  shift,
  shiftDefinition,
  staff,
  staffLeave,
  openShift,
  exceptionLog,
} from "@/db/schema";
import { eq, and, ne, lte, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { validateSwap, type SwapSideParams, type SwapViolation } from "@/lib/swap/validate-swap";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const request = db
    .select()
    .from(shiftSwapRequest)
    .where(eq(shiftSwapRequest.id, id))
    .get();

  if (!request) {
    return NextResponse.json(
      { error: "Swap request not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(request);
}

// ---------------------------------------------------------------------------
// Helper: compute total scheduled hours for a staff member in the Mon-Sun
// week containing shiftDate. Matches the week window used by the assignment
// dialog display so isOvertime flags stay consistent.
// ---------------------------------------------------------------------------
function computeWeeklyHours(staffId: string, shiftDate: string): number {
  const d = new Date(shiftDate + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const weekStart = new Date(d);
  weekStart.setUTCDate(d.getUTCDate() - daysFromMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  const rows = db
    .select({ durationHours: shiftDefinition.durationHours })
    .from(assignment)
    .innerJoin(shift, eq(assignment.shiftId, shift.id))
    .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
    .where(
      and(
        eq(assignment.staffId, staffId),
        gte(shift.date, fmt(weekStart)),
        lte(shift.date, fmt(weekEnd)),
        ne(assignment.status, "called_out"),
        ne(assignment.status, "cancelled")
      )
    )
    .all();
  return rows.reduce((sum, r) => sum + r.durationHours, 0);
}

// ---------------------------------------------------------------------------
// Helper: fetch shift details (date + shift def) for an assignment
// ---------------------------------------------------------------------------
function getShiftDetails(assignmentRow: { shiftId: string }) {
  return db
    .select({
      date: shift.date,
      startTime: shiftDefinition.startTime,
      endTime: shiftDefinition.endTime,
      unit: shiftDefinition.unit,
    })
    .from(shift)
    .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
    .where(eq(shift.id, assignmentRow.shiftId))
    .get();
}

// ---------------------------------------------------------------------------
// Helper: fetch coworkers on a given shiftId (excluding one staffId)
// ---------------------------------------------------------------------------
function getCoworkers(shiftId: string, excludeStaffId: string) {
  return db
    .select({ icuCompetencyLevel: staff.icuCompetencyLevel })
    .from(assignment)
    .innerJoin(staff, eq(assignment.staffId, staff.id))
    .where(
      and(
        eq(assignment.shiftId, shiftId),
        ne(assignment.staffId, excludeStaffId),
        ne(assignment.status, "called_out"),
        ne(assignment.status, "cancelled")
      )
    )
    .all();
}

// ---------------------------------------------------------------------------
// Helper: fetch other assignments for a staff member on a given date
// (excluding a known assignment ID so we don't count their current slot)
// ---------------------------------------------------------------------------
function getOtherAssignmentsOnDate(
  staffId: string,
  date: string,
  excludeAssignmentId: string
) {
  return db
    .select({
      startTime: shiftDefinition.startTime,
      endTime: shiftDefinition.endTime,
    })
    .from(assignment)
    .innerJoin(shift, eq(assignment.shiftId, shift.id))
    .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
    .where(
      and(
        eq(assignment.staffId, staffId),
        eq(shift.date, date),
        ne(assignment.id, excludeAssignmentId),
        ne(assignment.status, "called_out"),
        ne(assignment.status, "cancelled")
      )
    )
    .all();
}

// ---------------------------------------------------------------------------
// Helper: fetch assignments on D-1 and D+1 for rest-hours check
// (excluding a known assignment ID that is being swapped out)
// ---------------------------------------------------------------------------
function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getAdjacentAssignments(
  staffId: string,
  date: string,
  excludeAssignmentId: string
) {
  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);
  return db
    .select({
      date: shift.date,
      startTime: shiftDefinition.startTime,
      endTime: shiftDefinition.endTime,
    })
    .from(assignment)
    .innerJoin(shift, eq(assignment.shiftId, shift.id))
    .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
    .where(
      and(
        eq(assignment.staffId, staffId),
        ne(assignment.id, excludeAssignmentId),
        ne(assignment.status, "called_out"),
        ne(assignment.status, "cancelled")
      )
    )
    .all()
    .filter((row) => row.date === prevDate || row.date === nextDate);
}

// ---------------------------------------------------------------------------
// Helper: does staff have approved leave covering a date?
// ---------------------------------------------------------------------------
function hasApprovedLeave(staffId: string, date: string): boolean {
  const leave = db
    .select({ id: staffLeave.id })
    .from(staffLeave)
    .where(
      and(
        eq(staffLeave.staffId, staffId),
        eq(staffLeave.status, "approved"),
        lte(staffLeave.startDate, date),
        gte(staffLeave.endDate, date)
      )
    )
    .get();
  return !!leave;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const existing = db
    .select()
    .from(shiftSwapRequest)
    .where(eq(shiftSwapRequest.id, id))
    .get();

  if (!existing) {
    return NextResponse.json(
      { error: "Swap request not found" },
      { status: 404 }
    );
  }

  // -------------------------------------------------------------------------
  // APPROVE path
  // -------------------------------------------------------------------------
  if (body.status === "approved" && existing.status !== "approved") {
    const requestingAssignment = db
      .select()
      .from(assignment)
      .where(eq(assignment.id, existing.requestingAssignmentId))
      .get();

    // -----------------------------------------------------------------------
    // OPEN SWAP: no target staff/assignment — create a coverage request
    // -----------------------------------------------------------------------
    if (!existing.targetStaffId || !existing.targetAssignmentId) {
      if (requestingAssignment) {
        // Mark the requesting assignment as swapped so it's hidden from the grid
        db.update(assignment)
          .set({ status: "swapped", updatedAt: new Date().toISOString() })
          .where(eq(assignment.id, requestingAssignment.id))
          .run();

        // Create an open_shift coverage request so the manager can find a replacement
        db.insert(openShift)
          .values({
            shiftId: requestingAssignment.shiftId,
            originalStaffId: existing.requestingStaffId,
            originalAssignmentId: requestingAssignment.id,
            reason: "schedule_change",
            reasonDetail: `Open swap request approved — original notes: ${existing.notes ?? "none"}`,
            status: "pending_approval",
            priority: "normal",
          })
          .run();

        db.insert(exceptionLog)
          .values({
            entityType: "swap_request",
            entityId: id,
            action: "open_swap_approved",
            description: `Open swap approved for staff ${existing.requestingStaffId} — coverage request created for shift ${requestingAssignment.shiftId}`,
            newState: { status: "approved", coveredBy: "open_shift_created" },
            performedBy: body.reviewedBy || "nurse_manager",
          })
          .run();
      }
    } else {
      // -----------------------------------------------------------------------
      // DIRECTED SWAP: validate before performing
      // -----------------------------------------------------------------------
      const targetAssignment = db
        .select()
        .from(assignment)
        .where(eq(assignment.id, existing.targetAssignmentId))
        .get();

      if (requestingAssignment && targetAssignment) {
        // Fetch staff records
        const reqStaffRow = db
          .select({
            id: staff.id,
            firstName: staff.firstName,
            lastName: staff.lastName,
            role: staff.role,
            icuCompetencyLevel: staff.icuCompetencyLevel,
            isChargeNurseQualified: staff.isChargeNurseQualified,
          })
          .from(staff)
          .where(eq(staff.id, existing.requestingStaffId))
          .get();

        const tgtStaffRow = db
          .select({
            id: staff.id,
            firstName: staff.firstName,
            lastName: staff.lastName,
            role: staff.role,
            icuCompetencyLevel: staff.icuCompetencyLevel,
            isChargeNurseQualified: staff.isChargeNurseQualified,
          })
          .from(staff)
          .where(eq(staff.id, existing.targetStaffId))
          .get();

        const reqShiftDetails = getShiftDetails(requestingAssignment);
        const tgtShiftDetails = getShiftDetails(targetAssignment);

        if (!reqStaffRow || !tgtStaffRow || !reqShiftDetails || !tgtShiftDetails) {
          return NextResponse.json(
            { error: "Cannot validate swap: assignment or staff record not found" },
            { status: 400 }
          );
        }

        {
          const reqName = `${reqStaffRow.firstName} ${reqStaffRow.lastName}`;
          const tgtName = `${tgtStaffRow.firstName} ${tgtStaffRow.lastName}`;

          // Coworkers remaining on each shift after the swap
          // (requesting staff leaves their shift; target staff leaves their shift)
          const coworkersOnReqShift = getCoworkers(
            requestingAssignment.shiftId,
            existing.requestingStaffId
          );
          const coworkersOnTgtShift = getCoworkers(
            targetAssignment.shiftId,
            existing.targetStaffId
          );

          // Other assignments each staff member has on the date they'd move to
          const reqOtherOnTgtDate = getOtherAssignmentsOnDate(
            existing.requestingStaffId,
            tgtShiftDetails.date,
            requestingAssignment.id
          );
          const tgtOtherOnReqDate = getOtherAssignmentsOnDate(
            existing.targetStaffId,
            reqShiftDetails.date,
            targetAssignment.id
          );

          // Leave checks
          const reqHasLeave = hasApprovedLeave(existing.requestingStaffId, tgtShiftDetails.date);
          const tgtHasLeave = hasApprovedLeave(existing.targetStaffId, reqShiftDetails.date);

          // Adjacent (D-1/D+1) assignments for rest-hours check
          // Each staff member moves to a new date, so we check adjacency around their NEW date.
          const reqAdjacentToTgtDate = getAdjacentAssignments(
            existing.requestingStaffId,
            tgtShiftDetails.date,
            requestingAssignment.id
          );
          const tgtAdjacentToReqDate = getAdjacentAssignments(
            existing.targetStaffId,
            reqShiftDetails.date,
            targetAssignment.id
          );

          // Requesting staff takes the TARGET shift
          const requestingSide: SwapSideParams = {
            staff: {
              id: reqStaffRow.id,
              name: reqName,
              role: reqStaffRow.role,
              icuCompetencyLevel: reqStaffRow.icuCompetencyLevel,
              isChargeNurseQualified: reqStaffRow.isChargeNurseQualified,
            },
            takesShift: {
              date: tgtShiftDetails.date,
              startTime: tgtShiftDetails.startTime,
              endTime: tgtShiftDetails.endTime,
              isChargeNurse: targetAssignment.isChargeNurse,
              unit: tgtShiftDetails.unit,
            },
            coworkersOnTakesShift: coworkersOnTgtShift,
            otherAssignmentsOnDate: reqOtherOnTgtDate,
            adjacentAssignments: reqAdjacentToTgtDate,
            hasApprovedLeave: reqHasLeave,
          };

          // Target staff takes the REQUESTING shift
          const targetSide: SwapSideParams = {
            staff: {
              id: tgtStaffRow.id,
              name: tgtName,
              role: tgtStaffRow.role,
              icuCompetencyLevel: tgtStaffRow.icuCompetencyLevel,
              isChargeNurseQualified: tgtStaffRow.isChargeNurseQualified,
            },
            takesShift: {
              date: reqShiftDetails.date,
              startTime: reqShiftDetails.startTime,
              endTime: reqShiftDetails.endTime,
              isChargeNurse: requestingAssignment.isChargeNurse,
              unit: reqShiftDetails.unit,
            },
            coworkersOnTakesShift: coworkersOnReqShift,
            otherAssignmentsOnDate: tgtOtherOnReqDate,
            adjacentAssignments: tgtAdjacentToReqDate,
            hasApprovedLeave: tgtHasLeave,
          };

          // Role compatibility: RN can only swap with RN, CNA with CNA, etc.
          // Check this first — role mismatch is a hard block; no need to run further checks.
          if (reqStaffRow.role !== tgtStaffRow.role) {
            return NextResponse.json(
              {
                error: "Swap violates hard scheduling rules",
                violations: [
                  {
                    staffId: reqStaffRow.id,
                    staffName: reqName,
                    ruleId: "role-compatibility",
                    severity: "hard",
                    description: `${reqName} (${reqStaffRow.role}) and ${tgtName} (${tgtStaffRow.role}) have different roles — a ${tgtStaffRow.role} cannot cover an ${reqStaffRow.role} shift.`,
                  } satisfies SwapViolation,
                ],
              },
              { status: 422 }
            );
          }

          const violations = validateSwap(requestingSide, targetSide);
          if (violations.length > 0) {
            return NextResponse.json(
              {
                error: "Swap violates hard scheduling rules",
                violations,
              },
              { status: 422 }
            );
          }

          // All checks passed — compute isOvertime for each staff member's new shift
          // before performing the swap, so the DB flag stays in sync with the display.
          const reqNewDuration = db
            .select({ durationHours: shiftDefinition.durationHours })
            .from(shift)
            .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
            .where(eq(shift.id, targetAssignment.shiftId)) // requesting staff takes target's shift
            .get()?.durationHours ?? 0;
          const tgtNewDuration = db
            .select({ durationHours: shiftDefinition.durationHours })
            .from(shift)
            .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
            .where(eq(shift.id, requestingAssignment.shiftId)) // target staff takes requesting's shift
            .get()?.durationHours ?? 0;

          const reqIsOvertime =
            computeWeeklyHours(existing.requestingStaffId, tgtShiftDetails.date) + reqNewDuration > 40;
          const tgtIsOvertime =
            computeWeeklyHours(existing.targetStaffId, reqShiftDetails.date) + tgtNewDuration > 40;

          // Perform the swap
          db.update(assignment)
            .set({
              staffId: existing.targetStaffId,
              assignmentSource: "swap",
              isOvertime: reqIsOvertime,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(assignment.id, requestingAssignment.id))
            .run();

          db.update(assignment)
            .set({
              staffId: existing.requestingStaffId,
              assignmentSource: "swap",
              isOvertime: tgtIsOvertime,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(assignment.id, targetAssignment.id))
            .run();

          db.insert(exceptionLog)
            .values({
              entityType: "swap_request",
              entityId: id,
              action: "swap_approved",
              description: `Swap approved between ${reqName} and ${tgtName}`,
              previousState: {
                requestingAssignmentId: existing.requestingAssignmentId,
                targetAssignmentId: existing.targetAssignmentId,
              },
              newState: { status: "approved" },
              performedBy: body.reviewedBy || "nurse_manager",
            })
            .run();
        }
      }
    }
  }

  if (body.status === "denied") {
    // Fetch staff names and shift dates for a readable denial description
    const reqStaff = existing.requestingStaffId
      ? db.select({ firstName: staff.firstName, lastName: staff.lastName })
          .from(staff).where(eq(staff.id, existing.requestingStaffId)).get()
      : null;
    const tgtStaff = existing.targetStaffId
      ? db.select({ firstName: staff.firstName, lastName: staff.lastName })
          .from(staff).where(eq(staff.id, existing.targetStaffId)).get()
      : null;

    const reqAssignment = existing.requestingAssignmentId
      ? db.select().from(assignment).where(eq(assignment.id, existing.requestingAssignmentId)).get()
      : null;
    const tgtAssignment = existing.targetAssignmentId
      ? db.select().from(assignment).where(eq(assignment.id, existing.targetAssignmentId)).get()
      : null;

    const reqShift = reqAssignment ? getShiftDetails(reqAssignment) : null;
    const tgtShift = tgtAssignment ? getShiftDetails(tgtAssignment) : null;

    const reqLabel = reqStaff ? `${reqStaff.firstName} ${reqStaff.lastName}` : existing.requestingStaffId;
    const tgtLabel = tgtStaff ? `${tgtStaff.firstName} ${tgtStaff.lastName}` : (existing.targetStaffId ?? "open swap");
    const reqDate = reqShift?.date ?? "unknown date";
    const tgtDate = tgtShift?.date ?? "";

    const swapDesc = tgtDate
      ? `${reqLabel} (${reqDate}) ↔ ${tgtLabel} (${tgtDate})`
      : `${reqLabel} (${reqDate}) — open swap`;

    const reasonSuffix = body.denialReason ? ` — Reason: ${body.denialReason}` : "";
    const violationSuffix = body.validationNotes ? ` — Violations: ${body.validationNotes}` : "";

    db.insert(exceptionLog).values({
      entityType: "swap_request",
      entityId: id,
      action: "swap_denied",
      description: `Swap denied: ${swapDesc}${reasonSuffix}${violationSuffix}`,
      previousState: { status: existing.status },
      newState: {
        status: "denied",
        denialReason: body.denialReason ?? null,
        validationNotes: body.validationNotes ?? null,
      },
      justification: body.denialReason || undefined,
      performedBy: body.reviewedBy ?? "nurse_manager",
    }).run();
  }

  const updated = db
    .update(shiftSwapRequest)
    .set({
      targetAssignmentId: body.targetAssignmentId ?? existing.targetAssignmentId,
      targetStaffId: body.targetStaffId ?? existing.targetStaffId,
      status: body.status,
      notes: body.notes ?? existing.notes,
      validationNotes: body.validationNotes,
      denialReason: body.denialReason,
      reviewedAt: body.status !== "pending" ? new Date().toISOString() : existing.reviewedAt,
      reviewedBy: body.reviewedBy ?? existing.reviewedBy,
    })
    .where(eq(shiftSwapRequest.id, id))
    .returning()
    .get();

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = db
    .select()
    .from(shiftSwapRequest)
    .where(eq(shiftSwapRequest.id, id))
    .get();

  if (!existing) {
    return NextResponse.json(
      { error: "Swap request not found" },
      { status: 404 }
    );
  }

  if (existing.status !== "pending") {
    return NextResponse.json(
      { error: "Can only delete pending swap requests" },
      { status: 400 }
    );
  }

  // Fetch names and shift dates for a readable deletion log entry
  const delReqStaff = existing.requestingStaffId
    ? db.select({ firstName: staff.firstName, lastName: staff.lastName })
        .from(staff).where(eq(staff.id, existing.requestingStaffId)).get()
    : null;
  const delTgtStaff = existing.targetStaffId
    ? db.select({ firstName: staff.firstName, lastName: staff.lastName })
        .from(staff).where(eq(staff.id, existing.targetStaffId)).get()
    : null;

  const delReqAssignment = existing.requestingAssignmentId
    ? db.select().from(assignment).where(eq(assignment.id, existing.requestingAssignmentId)).get()
    : null;
  const delTgtAssignment = existing.targetAssignmentId
    ? db.select().from(assignment).where(eq(assignment.id, existing.targetAssignmentId)).get()
    : null;

  const delReqShift = delReqAssignment ? getShiftDetails(delReqAssignment) : null;
  const delTgtShift = delTgtAssignment ? getShiftDetails(delTgtAssignment) : null;

  const delReqLabel = delReqStaff
    ? `${delReqStaff.firstName} ${delReqStaff.lastName}`
    : existing.requestingStaffId;
  const delTgtLabel = delTgtStaff
    ? `${delTgtStaff.firstName} ${delTgtStaff.lastName}`
    : (existing.targetStaffId ?? "open swap");
  const delReqDate = delReqShift?.date ?? "unknown date";
  const delTgtDate = delTgtShift?.date ?? "";

  const delSwapDesc = delTgtDate
    ? `${delReqLabel} (${delReqDate}) ↔ ${delTgtLabel} (${delTgtDate})`
    : `${delReqLabel} (${delReqDate}) — open swap`;

  db.insert(exceptionLog)
    .values({
      entityType: "swap_request",
      entityId: id,
      action: "deleted",
      description: `Swap request deleted: ${delSwapDesc}`,
      previousState: existing as unknown as Record<string, unknown>,
      performedBy: "nurse_manager",
      createdAt: new Date().toISOString(),
    })
    .run();

  db.delete(shiftSwapRequest).where(eq(shiftSwapRequest.id, id)).run();
  return NextResponse.json({ success: true });
}
