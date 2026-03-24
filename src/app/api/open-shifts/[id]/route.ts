import { db } from "@/db";
import { openShift, assignment, shift, shiftDefinition, exceptionLog } from "@/db/schema";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Compute the total scheduled hours for a staff member in the Sun-Sat week
 * containing `shiftDate`. Used to accurately set isOvertime on new assignments.
 */
function computeWeeklyHours(staffId: string, shiftDate: string): number {
  const d = new Date(shiftDate + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun
  const weekStart = new Date(d);
  weekStart.setUTCDate(d.getUTCDate() - day);
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const record = db.select().from(openShift).where(eq(openShift.id, id)).get();

  if (!record) {
    return NextResponse.json({ error: "Open shift not found" }, { status: 404 });
  }

  return NextResponse.json(record);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const existing = db.select().from(openShift).where(eq(openShift.id, id)).get();

  if (!existing) {
    return NextResponse.json({ error: "Coverage request not found" }, { status: 404 });
  }

  // ACTION: Approve a recommended candidate
  // This is the main workflow - manager approves one of the top 3 recommendations
  if (body.action === "approve" && body.selectedStaffId) {
    const shiftRecord = db.select().from(shift).where(eq(shift.id, existing.shiftId)).get();

    if (!shiftRecord) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    // Find the selected candidate in recommendations to get their details
    const recommendations = existing.recommendations as Array<{
      staffId: string;
      staffName: string;
      source: "float" | "per_diem" | "overtime" | "agency";
      isOvertime: boolean;
    }> || [];

    const selectedCandidate = recommendations.find(r => r.staffId === body.selectedStaffId);
    const source = selectedCandidate?.source || body.source || "manual";

    // Compute isOvertime dynamically based on current DB hours, not stale snapshot.
    const shiftRecord2 = db
      .select({ date: shift.date, durationHours: shiftDefinition.durationHours })
      .from(shift)
      .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
      .where(eq(shift.id, existing.shiftId))
      .get();
    const currentWeekHours = shiftRecord2
      ? computeWeeklyHours(body.selectedStaffId, shiftRecord2.date)
      : 0;
    const shiftDuration = shiftRecord2?.durationHours ?? 0;
    const isOvertime = currentWeekHours + shiftDuration > 40;

    // Handle agency selection differently - just mark as approved, no assignment
    if (body.selectedStaffId === "agency") {
      const updated = db
        .update(openShift)
        .set({
          status: "approved",
          selectedStaffId: null,
          selectedSource: "agency",
          approvedAt: new Date().toISOString(),
          approvedBy: body.approvedBy || "nurse_manager",
          notes: "Agency approved - awaiting agency confirmation",
        })
        .where(eq(openShift.id, id))
        .returning()
        .get();

      db.insert(exceptionLog)
        .values({
          entityType: "open_shift",
          entityId: id,
          action: "open_shift_filled",
          description: `Coverage approved for agency staff. Requires external agency contact.`,
          previousState: { status: existing.status },
          newState: { status: "approved", selectedSource: "agency" },
          performedBy: body.approvedBy || "nurse_manager",
          createdAt: new Date().toISOString(),
        })
        .run();

      return NextResponse.json(updated);
    }

    // Check if the original nurse was the charge nurse so the replacement inherits the role.
    // Without this, every coverage approval for a charge nurse creates a hard "Charge Nurse Required" violation.
    const originalAssignment = existing.originalStaffId
      ? db.select({ isChargeNurse: assignment.isChargeNurse })
          .from(assignment)
          .where(and(eq(assignment.staffId, existing.originalStaffId), eq(assignment.shiftId, existing.shiftId)))
          .get()
      : null;
    const inheritChargeRole = originalAssignment?.isChargeNurse === true;

    // Create new assignment for the approved staff
    const newAssignment = db
      .insert(assignment)
      .values({
        shiftId: existing.shiftId,
        staffId: body.selectedStaffId,
        scheduleId: shiftRecord.scheduleId,
        isChargeNurse: inheritChargeRole,
        isOvertime: isOvertime,
        assignmentSource: source === "float" ? "float" : source === "overtime" ? "manual" : "callout_replacement",
        notes: `Auto-filled from coverage request (original: ${existing.originalStaffId}, source: ${source})`,
      })
      .returning()
      .get();

    // Hide the original nurse's assignment from the schedule grid
    if (existing.originalStaffId) {
      db.update(assignment)
        .set({ status: "called_out", updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(assignment.staffId, existing.originalStaffId),
            eq(assignment.shiftId, existing.shiftId)
          )
        )
        .run();
    }

    // Update coverage request as filled
    const updated = db
      .update(openShift)
      .set({
        status: "filled",
        selectedStaffId: body.selectedStaffId,
        selectedSource: source,
        approvedAt: new Date().toISOString(),
        approvedBy: body.approvedBy || "nurse_manager",
        filledAt: new Date().toISOString(),
        filledByStaffId: body.selectedStaffId,
        filledByAssignmentId: newAssignment.id,
      })
      .where(eq(openShift.id, id))
      .returning()
      .get();

    // Log the approval and fill
    db.insert(exceptionLog)
      .values({
        entityType: "open_shift",
        entityId: id,
        action: "open_shift_filled",
        description: `Coverage approved and filled by ${selectedCandidate?.staffName || body.selectedStaffId} (${source})`,
        previousState: { status: existing.status },
        newState: { status: "filled", filledByStaffId: body.selectedStaffId, source },
        performedBy: body.approvedBy || "nurse_manager",
        createdAt: new Date().toISOString(),
      })
      .run();

    return NextResponse.json(updated);
  }

  // ACTION: Legacy fill (manual assignment without going through recommendations)
  if (body.action === "fill" && body.filledByStaffId) {
    const shiftRecord = db.select().from(shift).where(eq(shift.id, existing.shiftId)).get();

    if (!shiftRecord) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    // Inherit charge role from original assignment (same reason as approve action above)
    const originalAssignmentFill = existing.originalStaffId
      ? db.select({ isChargeNurse: assignment.isChargeNurse })
          .from(assignment)
          .where(and(eq(assignment.staffId, existing.originalStaffId), eq(assignment.shiftId, existing.shiftId)))
          .get()
      : null;
    const inheritChargeRoleFill = originalAssignmentFill?.isChargeNurse === true;

    // Compute isOvertime dynamically for the fill action too
    const fillShiftDetails = db
      .select({ date: shift.date, durationHours: shiftDefinition.durationHours })
      .from(shift)
      .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
      .where(eq(shift.id, existing.shiftId))
      .get();
    const fillWeekHours = fillShiftDetails
      ? computeWeeklyHours(body.filledByStaffId, fillShiftDetails.date)
      : 0;
    const fillShiftDuration = fillShiftDetails?.durationHours ?? 0;
    const fillIsOvertime = fillWeekHours + fillShiftDuration > 40;

    // Create new assignment for the staff filling the shift
    const newAssignment = db
      .insert(assignment)
      .values({
        shiftId: existing.shiftId,
        staffId: body.filledByStaffId,
        scheduleId: shiftRecord.scheduleId,
        isChargeNurse: inheritChargeRoleFill,
        isOvertime: fillIsOvertime,
        assignmentSource: "manual",
        notes: `Manually filled from coverage request (original: ${existing.originalStaffId})`,
      })
      .returning()
      .get();

    // Hide the original nurse's assignment from the schedule grid
    if (existing.originalStaffId) {
      db.update(assignment)
        .set({ status: "called_out", updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(assignment.staffId, existing.originalStaffId),
            eq(assignment.shiftId, existing.shiftId)
          )
        )
        .run();
    }

    // Update coverage request as filled
    const updated = db
      .update(openShift)
      .set({
        status: "filled",
        filledAt: new Date().toISOString(),
        filledByStaffId: body.filledByStaffId,
        filledByAssignmentId: newAssignment.id,
      })
      .where(eq(openShift.id, id))
      .returning()
      .get();

    // Log the fill action
    db.insert(exceptionLog)
      .values({
        entityType: "open_shift",
        entityId: id,
        action: "open_shift_filled",
        description: `Coverage manually filled by staff ${body.filledByStaffId}`,
        previousState: { status: existing.status },
        newState: { status: "filled", filledByStaffId: body.filledByStaffId },
        performedBy: body.performedBy || "nurse_manager",
        createdAt: new Date().toISOString(),
      })
      .run();

    return NextResponse.json(updated);
  }

  // ACTION: Cancel the coverage request
  if (body.action === "cancel") {
    const updated = db
      .update(openShift)
      .set({
        status: "cancelled",
        notes: body.notes || existing.notes,
      })
      .where(eq(openShift.id, id))
      .returning()
      .get();

    db.insert(exceptionLog)
      .values({
        entityType: "open_shift",
        entityId: id,
        action: "open_shift_cancelled",
        description: `Coverage request cancelled`,
        previousState: { status: existing.status },
        newState: { status: "cancelled" },
        justification: body.notes || undefined,
        performedBy: body.performedBy || "nurse_manager",
        createdAt: new Date().toISOString(),
      })
      .run();

    return NextResponse.json(updated);
  }

  // General update
  const updated = db
    .update(openShift)
    .set({
      status: body.status ?? existing.status,
      priority: body.priority ?? existing.priority,
      notes: body.notes ?? existing.notes,
    })
    .where(eq(openShift.id, id))
    .returning()
    .get();

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = db.select().from(openShift).where(eq(openShift.id, id)).get();
  if (existing) {
    db.insert(exceptionLog)
      .values({
        entityType: "open_shift",
        entityId: id,
        action: "deleted",
        description: `Coverage request deleted for shift ${existing.shiftId}`,
        previousState: existing as unknown as Record<string, unknown>,
        performedBy: "nurse_manager",
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  db.delete(openShift).where(eq(openShift.id, id)).run();
  return NextResponse.json({ success: true });
}
