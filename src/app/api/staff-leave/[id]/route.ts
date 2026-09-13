import { db } from "@/db";
import {
  staffLeave,
  exceptionLog,
  assignment,
  shift,
  shiftDefinition,
  schedule,
  unit,
  openShift,
  callout,
  staff,
  shiftSwapRequest,
  notification,
} from "@/db/schema";
import { eq, and, or, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { findCandidatesForShift } from "@/lib/coverage/find-candidates";
import {
  insertNotification,
  composeLeaveDecided,
  composeOpenShiftPosted,
  composeCalloutPosted,
} from "@/lib/notifications/notify";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const leave = db.select().from(staffLeave).where(eq(staffLeave.id, id)).get();

  if (!leave) {
    return NextResponse.json({ error: "Leave not found" }, { status: 404 });
  }

  return NextResponse.json(leave);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const existing = db
    .select()
    .from(staffLeave)
    .where(eq(staffLeave.id, id))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Leave not found" }, { status: 404 });
  }

  // Denial reason is required when denying a leave request
  if (body.status === "denied" && !body.denialReason?.trim()) {
    return NextResponse.json(
      { error: "A denial reason is required when denying a leave request." },
      { status: 400 },
    );
  }

  // Optimistic lock: only update if the status is still what we read. A
  // double-click or concurrent approval would otherwise run the approval
  // side effects twice, creating duplicate coverage requests (two
  // replacements hired for one vacancy).
  const updated = db
    .update(staffLeave)
    .set({
      leaveType: body.leaveType,
      startDate: body.startDate,
      endDate: body.endDate,
      status: body.status,
      notes: body.notes,
      approvedAt:
        body.status === "approved"
          ? new Date().toISOString()
          : existing.approvedAt,
      approvedBy: body.approvedBy ?? existing.approvedBy,
      denialReason: body.denialReason,
    })
    .where(and(eq(staffLeave.id, id), eq(staffLeave.status, existing.status)))
    .returning()
    .get();

  if (!updated) {
    return NextResponse.json(
      {
        error:
          "Leave request was modified by someone else — refresh and try again.",
      },
      { status: 409 },
    );
  }

  // Log status change if status changed
  if (existing.status !== body.status) {
    const actionMap: Record<
      string,
      "leave_approved" | "leave_denied" | "updated"
    > = {
      approved: "leave_approved",
      denied: "leave_denied",
    };
    const action = actionMap[body.status] ?? "updated";

    const staffRecord = db
      .select({ firstName: staff.firstName, lastName: staff.lastName })
      .from(staff)
      .where(eq(staff.id, existing.staffId))
      .get();
    const staffName = staffRecord
      ? `${staffRecord.firstName} ${staffRecord.lastName}`
      : existing.staffId;

    const descriptionSuffix =
      body.status === "denied" && body.denialReason
        ? ` — Reason: ${body.denialReason}`
        : "";

    db.insert(exceptionLog)
      .values({
        entityType: "leave",
        entityId: id,
        action,
        description: `Leave ${body.status} for ${staffName} (${existing.leaveType}, ${existing.startDate} to ${existing.endDate})${descriptionSuffix}`,
        previousState: { status: existing.status },
        newState: { status: body.status, denialReason: body.denialReason },
        performedBy: body.approvedBy || "nurse_manager",
        createdAt: new Date().toISOString(),
      })
      .run();

    // Phase 3 notification: tell the nurse their leave was approved/denied.
    // Best-effort — a notify failure must never break the leave decision.
    if (body.status === "approved" || body.status === "denied") {
      try {
        insertNotification(
          db,
          notification,
          composeLeaveDecided({
            staffId: existing.staffId,
            outcome: body.status,
            startDate: existing.startDate,
            endDate: existing.endDate,
          }),
        );
      } catch (err) {
        console.error("[notify] leave_decided failed", err);
      }
    }

    // If approved, create open shifts or callouts for affected assignments
    if (body.status === "approved") {
      await handleLeaveApproval(
        existing.staffId,
        staffName,
        updated!.startDate,
        updated!.endDate,
      );
    }
  }

  return NextResponse.json(updated);
}

/**
 * When leave is approved, find affected assignments and handle coverage:
 * - If shift is within callout threshold days: create callout (urgent - follow escalation)
 * - If shift is beyond threshold: find top 3 replacement candidates and present for approval
 */
async function handleLeaveApproval(
  staffId: string,
  staffName: string,
  startDate: string,
  endDate: string,
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find all assignments for this staff during the leave period
  const affectedAssignments = db
    .select({
      assignmentId: assignment.id,
      shiftId: shift.id,
      shiftDate: shift.date,
      scheduleId: assignment.scheduleId,
      scheduleUnit: schedule.unit,
    })
    .from(assignment)
    .innerJoin(shift, eq(assignment.shiftId, shift.id))
    .innerJoin(schedule, eq(assignment.scheduleId, schedule.id))
    .where(
      and(
        eq(assignment.staffId, staffId),
        gte(shift.date, startDate),
        lte(shift.date, endDate),
        eq(assignment.status, "assigned"),
      ),
    )
    .all();

  for (const a of affectedAssignments) {
    const shiftDate = new Date(a.shiftDate + "T00:00:00");
    const daysUntilShift = Math.ceil(
      (shiftDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Get unit config for threshold
    const unitConfig = db
      .select()
      .from(unit)
      .where(eq(unit.name, a.scheduleUnit))
      .get();

    const calloutThreshold = unitConfig?.calloutThresholdDays ?? 7;
    const isUrgent = daysUntilShift <= calloutThreshold;
    // Urgent callouts still get posted to eligible nurses when there is at
    // least one full day to go — a nurse should hear that a shift in 4-5 days
    // is vacant even while the manager works the escalation chain. Same-day
    // or past-dated shifts are not posted: with hours left, the manager is
    // on the phone and a board notification is noise.
    const postUrgentCallout = isUrgent && daysUntilShift >= 1;

    // Candidate search is async — run it BEFORE the transaction below
    // (better-sqlite3 transactions are synchronous).
    let candidateResult: Awaited<
      ReturnType<typeof findCandidatesForShift>
    > | null = null;
    if (!isUrgent || postUrgentCallout) {
      // Full list (Infinity): every rule-eligible nurse gets the posting
      // notification below; the manager's stored recommendations stay top-3
      // via the slice at the insert.
      candidateResult = await findCandidatesForShift(
        a.shiftId,
        staffId, // Exclude the staff going on leave
        Infinity,
      );
    }

    // All mutations for one affected assignment commit atomically: a crash
    // mid-loop previously left the assignment cancelled with no coverage
    // record — the nurse vanished from the grid with nothing to replace her.
    db.transaction(() => {
      // Update assignment status to cancelled
      db.update(assignment)
        .set({
          status: "cancelled",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(assignment.id, a.assignmentId))
        .run();

      // Void any pending swap requests referencing the cancelled assignment.
      // Approving such a swap later would mutate a dead assignment — both
      // nurses silently vanish from the grid and the shift is doubly uncovered.
      const staleSwaps = db
        .select()
        .from(shiftSwapRequest)
        .where(
          and(
            eq(shiftSwapRequest.status, "pending"),
            or(
              eq(shiftSwapRequest.requestingAssignmentId, a.assignmentId),
              eq(shiftSwapRequest.targetAssignmentId, a.assignmentId),
            ),
          ),
        )
        .all();
      for (const s of staleSwaps) {
        db.update(shiftSwapRequest)
          .set({
            status: "denied",
            denialReason: `Assignment cancelled due to approved leave for ${staffName}`,
            reviewedAt: new Date().toISOString(),
            reviewedBy: "system",
          })
          .where(eq(shiftSwapRequest.id, s.id))
          .run();
        db.insert(exceptionLog)
          .values({
            entityType: "swap_request",
            entityId: s.id,
            action: "swap_denied",
            description: `Swap request automatically denied — assignment on ${a.shiftDate} was cancelled by approved leave for ${staffName}`,
            performedBy: "system",
            createdAt: new Date().toISOString(),
          })
          .run();
      }

      if (isUrgent) {
        // Create callout (urgent - within threshold)
        // This follows the existing escalation workflow
        const newCallout = db
          .insert(callout)
          .values({
            assignmentId: a.assignmentId,
            staffId: staffId,
            shiftId: a.shiftId,
            reason: "other",
            reasonDetail: "Leave approved - urgent replacement needed",
            status: "open",
          })
          .returning()
          .get();

        // Log the callout creation
        db.insert(exceptionLog)
          .values({
            entityType: "callout",
            entityId: newCallout.id,
            action: "callout_logged",
            description: `Callout created due to approved leave for ${staffName}, shift on ${a.shiftDate}`,
            performedBy: "system",
            createdAt: new Date().toISOString(),
          })
          .run();
      } else {
        const { candidates, escalationStepsChecked } = candidateResult!;

        // Determine status based on whether we found candidates
        const hasRealCandidates = candidates.some(
          (c) => c.staffId !== "agency",
        );
        const status = hasRealCandidates ? "pending_approval" : "no_candidates";

        // Create coverage request with recommendations
        const newCoverageRequest = db
          .insert(openShift)
          .values({
            shiftId: a.shiftId,
            originalStaffId: staffId,
            originalAssignmentId: a.assignmentId,
            reason: "leave_approved",
            reasonDetail: `Leave approved - ${candidates.length > 0 ? "replacement candidates found" : "no candidates available"}`,
            status: status,
            priority: daysUntilShift > 14 ? "low" : "normal",
            // Manager surface keeps its top-3 contract; the full list only
            // feeds the eligibility notifications below.
            recommendations: candidates.slice(0, 3),
            escalationStepsChecked: escalationStepsChecked,
          })
          .returning()
          .get();

        // Log the coverage request creation
        db.insert(exceptionLog)
          .values({
            entityType: "open_shift",
            entityId: newCoverageRequest?.id || a.shiftId,
            action: "open_shift_created",
            description: `Coverage request created for shift on ${a.shiftDate}. Found ${candidates.length} candidate(s). Status: ${status}`,
            newState: {
              candidates: candidates.map((c) => ({
                staffId: c.staffId,
                name: c.staffName,
                source: c.source,
              })),
              escalationStepsChecked,
            },
            performedBy: "system",
            createdAt: new Date().toISOString(),
          })
          .run();
      }
    });

    // Notify every rule-eligible nurse about the vacancy. Non-urgent: an
    // open-shift posting they can raise a hand on. Urgent with >= 1 day to
    // go: a callout notice asking them to contact the manager. Best-effort:
    // a notify failure never breaks the approval.
    if ((!isUrgent || postUrgentCallout) && candidateResult) {
      try {
        const defInfo = db
          .select({
            name: shiftDefinition.name,
            shiftType: shiftDefinition.shiftType,
            unit: shiftDefinition.unit,
          })
          .from(shiftDefinition)
          .innerJoin(shift, eq(shift.shiftDefinitionId, shiftDefinition.id))
          .where(eq(shift.id, a.shiftId))
          .get();
        const shiftLabel = defInfo?.name ?? defInfo?.shiftType ?? "Shift";
        for (const c of candidateResult.candidates) {
          // Agency rows are placeholders, not notifiable staff.
          if (c.source === "agency" || c.staffId === staffId) continue;
          insertNotification(
            db,
            notification,
            isUrgent
              ? composeCalloutPosted({
                  staffId: c.staffId,
                  date: a.shiftDate,
                  shiftLabel,
                  unit: defInfo?.unit ?? a.scheduleUnit,
                  daysUntilShift,
                })
              : composeOpenShiftPosted({
                  staffId: c.staffId,
                  date: a.shiftDate,
                  shiftLabel,
                  unit: defInfo?.unit ?? a.scheduleUnit,
                }),
          );
        }
      } catch (err) {
        console.error(
          isUrgent
            ? "[notify] callout_posted failed"
            : "[notify] open_shift_posted failed",
          err,
        );
      }
    }
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const existing = db
    .select()
    .from(staffLeave)
    .where(eq(staffLeave.id, id))
    .get();

  // Nurses may only withdraw THEIR OWN request while it is still pending.
  // Once a manager has decided (approved/denied), coverage may already be in
  // motion — undoing that is a manager action. Managers (or auth off) keep the
  // unrestricted delete they always had.
  const role = request.headers.get("x-user-role");
  const callerStaffId = request.headers.get("x-staff-id");
  const isNurseCaller = role === "nurse";
  if (isNurseCaller && existing) {
    if (existing.staffId !== callerStaffId) {
      return NextResponse.json(
        { error: "You can only withdraw your own request." },
        { status: 403 },
      );
    }
    if (existing.status !== "pending") {
      return NextResponse.json(
        {
          error:
            "This request was already decided — ask your manager to change it.",
        },
        { status: 409 },
      );
    }
  }

  if (existing) {
    const staffRecord = db
      .select({ firstName: staff.firstName, lastName: staff.lastName })
      .from(staff)
      .where(eq(staff.id, existing.staffId))
      .get();
    const staffName = staffRecord
      ? `${staffRecord.firstName} ${staffRecord.lastName}`
      : existing.staffId;

    db.insert(exceptionLog)
      .values({
        entityType: "leave",
        entityId: id,
        action: "deleted",
        description: isNurseCaller
          ? `Leave request withdrawn by ${staffName}: ${existing.leaveType} from ${existing.startDate} to ${existing.endDate}`
          : `Leave record deleted for ${staffName}: ${existing.leaveType} from ${existing.startDate} to ${existing.endDate}`,
        previousState: existing as unknown as Record<string, unknown>,
        justification: existing.reason || undefined,
        performedBy: isNurseCaller ? staffName : "nurse_manager",
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  db.delete(staffLeave).where(eq(staffLeave.id, id)).run();
  return NextResponse.json({ success: true });
}
