import { db } from "@/db";
import { openShift, shift, shiftDefinition, staff, assignment, exceptionLog } from "@/db/schema";
import { eq, and, aliasedTable } from "drizzle-orm";
import { NextResponse } from "next/server";
import { findCandidatesForShift } from "@/lib/coverage/find-candidates";

export async function GET() {
  const originalAssignment = aliasedTable(assignment, "original_assignment");

  const coverageRequests = db
    .select({
      id: openShift.id,
      shiftId: openShift.shiftId,
      originalStaffId: openShift.originalStaffId,
      originalAssignmentId: openShift.originalAssignmentId,
      reason: openShift.reason,
      reasonDetail: openShift.reasonDetail,
      status: openShift.status,
      priority: openShift.priority,
      recommendations: openShift.recommendations,
      escalationStepsChecked: openShift.escalationStepsChecked,
      selectedStaffId: openShift.selectedStaffId,
      selectedSource: openShift.selectedSource,
      createdAt: openShift.createdAt,
      approvedAt: openShift.approvedAt,
      approvedBy: openShift.approvedBy,
      filledAt: openShift.filledAt,
      filledByStaffId: openShift.filledByStaffId,
      notes: openShift.notes,
      // Shift details
      shiftDate: shift.date,
      shiftType: shiftDefinition.shiftType,
      shiftName: shiftDefinition.name,
      startTime: shiftDefinition.startTime,
      endTime: shiftDefinition.endTime,
      durationHours: shiftDefinition.durationHours,
      unit: shiftDefinition.unit,
      requiredStaffCount: shift.requiredStaffCount,
      // Original staff name
      originalStaffFirstName: staff.firstName,
      originalStaffLastName: staff.lastName,
      // Whether original nurse held the charge role
      originalWasChargeNurse: originalAssignment.isChargeNurse,
    })
    .from(openShift)
    .innerJoin(shift, eq(openShift.shiftId, shift.id))
    .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
    .innerJoin(staff, eq(openShift.originalStaffId, staff.id))
    .leftJoin(originalAssignment, eq(openShift.originalAssignmentId, originalAssignment.id))
    .orderBy(shift.date)
    .all();

  // Refresh recommendations live for pending/approved records so hoursThisWeek and
  // isOvertime always reflect current week totals, not the stale snapshot from when
  // the open shift was originally created.
  const ACTIVE_STATUSES = new Set(["pending_approval", "approved"]);
  const enriched = await Promise.all(
    coverageRequests.map(async (r) => {
      if (!ACTIVE_STATUSES.has(r.status)) return r;
      try {
        const { candidates, escalationStepsChecked } = await findCandidatesForShift(
          r.shiftId,
          r.originalStaffId ?? undefined
        );
        return { ...r, recommendations: candidates, escalationStepsChecked };
      } catch {
        // If refresh fails, fall back to stored snapshot
        return r;
      }
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const body = await request.json();

  const newOpenShift = db
    .insert(openShift)
    .values({
      shiftId: body.shiftId,
      originalStaffId: body.originalStaffId,
      originalAssignmentId: body.originalAssignmentId || null,
      reason: body.reason,
      reasonDetail: body.reasonDetail || null,
      status: "pending_approval",
      priority: body.priority || "normal",
      notes: body.notes || null,
    })
    .returning()
    .get();

  db.insert(exceptionLog)
    .values({
      entityType: "open_shift",
      entityId: newOpenShift.id,
      action: "open_shift_created",
      description: `Open shift created for shift ${body.shiftId}`,
      newState: newOpenShift as unknown as Record<string, unknown>,
      performedBy: body.performedBy || "nurse_manager",
    })
    .run();

  return NextResponse.json(newOpenShift, { status: 201 });
}
