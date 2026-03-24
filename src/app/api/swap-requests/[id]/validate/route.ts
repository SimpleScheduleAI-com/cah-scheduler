/**
 * GET /api/swap-requests/[id]/validate
 *
 * Runs all hard-rule validation for a swap request WITHOUT making any DB writes.
 * Used by the UI to show the manager a pre-approval check before committing.
 *
 * Returns:
 *   { valid: true,  violations: [],    openRequest?: true }  — no issues
 *   { valid: false, violations: [...] }                       — rule violations
 *   { valid: false, error: string }                           — data gap / not found
 */
import { db } from "@/db";
import {
  shiftSwapRequest,
  assignment,
  shift,
  shiftDefinition,
  staff,
  staffLeave,
} from "@/db/schema";
import { eq, and, ne, lte, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { validateSwap, type SwapSideParams } from "@/lib/swap/validate-swap";

// ---------------------------------------------------------------------------
// Helpers (mirrors the private helpers in the PUT route)
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

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(
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
    return NextResponse.json({ valid: false, error: "Swap request not found" }, { status: 404 });
  }

  // Open swap request — no target to validate against
  if (!existing.targetStaffId || !existing.targetAssignmentId) {
    return NextResponse.json({ valid: true, violations: [], openRequest: true });
  }

  // Directed swap — gather data and validate
  const requestingAssignment = db
    .select()
    .from(assignment)
    .where(eq(assignment.id, existing.requestingAssignmentId))
    .get();

  const targetAssignment = db
    .select()
    .from(assignment)
    .where(eq(assignment.id, existing.targetAssignmentId))
    .get();

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

  if (!requestingAssignment || !targetAssignment) {
    return NextResponse.json({ valid: false, error: "One or both shift assignments no longer exist." });
  }
  if (!reqStaffRow || !tgtStaffRow) {
    return NextResponse.json({ valid: false, error: "One or both staff records not found." });
  }

  const reqShiftDetails = getShiftDetails(requestingAssignment);
  const tgtShiftDetails = getShiftDetails(targetAssignment);

  if (!reqShiftDetails || !tgtShiftDetails) {
    return NextResponse.json({ valid: false, error: "Shift schedule details not found." });
  }

  const reqName = `${reqStaffRow.firstName} ${reqStaffRow.lastName}`;
  const tgtName = `${tgtStaffRow.firstName} ${tgtStaffRow.lastName}`;

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
    coworkersOnTakesShift: getCoworkers(targetAssignment.shiftId, existing.requestingStaffId),
    otherAssignmentsOnDate: getOtherAssignmentsOnDate(existing.requestingStaffId, tgtShiftDetails.date, requestingAssignment.id),
    adjacentAssignments: getAdjacentAssignments(existing.requestingStaffId, tgtShiftDetails.date, requestingAssignment.id),
    hasApprovedLeave: hasApprovedLeave(existing.requestingStaffId, tgtShiftDetails.date),
  };

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
    coworkersOnTakesShift: getCoworkers(requestingAssignment.shiftId, existing.targetStaffId),
    otherAssignmentsOnDate: getOtherAssignmentsOnDate(existing.targetStaffId, reqShiftDetails.date, targetAssignment.id),
    adjacentAssignments: getAdjacentAssignments(existing.targetStaffId, reqShiftDetails.date, targetAssignment.id),
    hasApprovedLeave: hasApprovedLeave(existing.targetStaffId, reqShiftDetails.date),
  };

  const violations = validateSwap(requestingSide, targetSide);

  return NextResponse.json({
    valid: violations.length === 0,
    violations,
  });
}
