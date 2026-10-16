import { db } from "@/db";
import {
  staffLeave,
  shiftSwapRequest,
  assignment,
  shift,
  schedule,
  staff,
  callout,
  openShift,
} from "@/db/schema";
import {
  eq,
  and,
  gte,
  lte,
  inArray,
  like,
  or,
  aliasedTable,
  desc,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { syncHolidayRowsForShifts } from "@/lib/holidays/holiday-tracking";

/**
 * Practice Examples — the First-Cycle Guide's daily-management tutorial (S6).
 *
 * The manager learns the six daily tools by ACTING on seeded practice records
 * built from their REAL roster and published schedule. The causal chain IS the
 * curriculum: approving a short-notice practice leave GENERATES a callout;
 * approving a long-notice one GENERATES an open shift. Nothing here touches the
 * schema — practice records are identified purely by a "[PRACTICE]" marker in
 * their own text fields (staffLeave.notes / shiftSwapRequest.notes).
 *
 * POST   — seed Leave A (short-notice), Leave B (planned), and a targeted swap.
 * GET    — status of the practice chain, including the callout/open-shift the
 *          leave approvals generated (joined via the affected assignment).
 * DELETE — deterministic teardown that reverts the whole chain; idempotent.
 */

const PRACTICE = "[PRACTICE]";

// Marker copy embedded in each seeded record's notes. The prefix is what GET and
// DELETE match on; the trailing sentence is the in-context lesson for the user.
const LEAVE_A_NOTE =
  "[PRACTICE] Short-notice — approve me and watch the Callouts page";
const LEAVE_B_NOTE =
  "[PRACTICE] Planned leave — approve me and watch Open Shifts";
const SWAP_NOTE = "[PRACTICE] Two nurses want to trade — approve or deny";

function todayMidnight(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function daysFromToday(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - todayMidnight().getTime()) / 86_400_000);
}

/**
 * All assignments in a currently-published schedule, dated in the future window,
 * joined to their shift date + staff role. Used to pick suitable practice
 * candidates (Leave A/B and the swap) from the manager's real data.
 */
function publishedFutureAssignments() {
  const today = todayMidnight().toISOString().slice(0, 10);
  const horizon = new Date(todayMidnight().getTime() + 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return db
    .select({
      assignmentId: assignment.id,
      staffId: assignment.staffId,
      shiftId: shift.id,
      shiftDate: shift.date,
      role: staff.role,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
    })
    .from(assignment)
    .innerJoin(shift, eq(assignment.shiftId, shift.id))
    .innerJoin(schedule, eq(assignment.scheduleId, schedule.id))
    .innerJoin(staff, eq(assignment.staffId, staff.id))
    .where(
      and(
        eq(schedule.status, "published"),
        eq(assignment.status, "assigned"),
        gte(shift.date, today),
        lte(shift.date, horizon),
      ),
    )
    .all();
}

/** Does any [PRACTICE] leave or swap already exist? */
function practiceExists(): boolean {
  const leave = db
    .select({ id: staffLeave.id })
    .from(staffLeave)
    .where(like(staffLeave.notes, `%${PRACTICE}%`))
    .get();
  if (leave) return true;
  const swap = db
    .select({ id: shiftSwapRequest.id })
    .from(shiftSwapRequest)
    .where(like(shiftSwapRequest.notes, `%${PRACTICE}%`))
    .get();
  return !!swap;
}

// ---------------------------------------------------------------------------
// POST — seed the practice chain
// ---------------------------------------------------------------------------
export async function POST() {
  if (practiceExists()) {
    return NextResponse.json(
      {
        error:
          "Practice examples already exist. Remove them before creating new ones.",
      },
      { status: 409 },
    );
  }

  const rows = publishedFutureAssignments();

  // Nothing to work with at all: tell the manager exactly which precondition
  // is missing instead of one catch-all message (a manager who HAS published
  // must learn the schedule doesn't cover the coming two weeks, not be told
  // to "publish first" again).
  if (rows.length === 0) {
    const latestPublished = db
      .select({ endDate: schedule.endDate })
      .from(schedule)
      .where(eq(schedule.status, "published"))
      .orderBy(desc(schedule.endDate))
      .limit(1)
      .get();
    const error = !latestPublished
      ? "Publish a schedule first — practice mode uses your real roster and your live published schedule."
      : daysFromToday(latestPublished.endDate) < 0
        ? `Your published schedule ended on ${latestPublished.endDate}, so no schedule covers today. Create and publish the next period, then start practice mode.`
        : "Your published schedule has no upcoming shifts in the next 14 days. Publish a schedule that covers the coming two weeks (generate drafts and apply one so it has assignments), then start practice mode again.";
    return NextResponse.json({ error }, { status: 422 });
  }

  // Leave A: a staff member with an assigned shift 2-6 days out (inside the
  // 7-day callout threshold, far enough out to act on).
  const leaveACandidate = rows.find((r) => {
    const d = daysFromToday(r.shiftDate);
    return d >= 2 && d <= 6;
  });

  // Leave B: a DIFFERENT staff member with an assigned shift 8-14 days out
  // (anything beyond the 7-day threshold lands as an open shift).
  const leaveBCandidate = rows.find((r) => {
    const d = daysFromToday(r.shiftDate);
    return d >= 8 && d <= 14 && r.staffId !== leaveACandidate?.staffId;
  });

  // Swap: two RNs with assigned shifts on DIFFERENT dates. Prefer staff not
  // already used for Leave A/B so the tutorial records stay distinct.
  const usedStaff = new Set(
    [leaveACandidate?.staffId, leaveBCandidate?.staffId].filter(Boolean),
  );
  const rnRows = rows.filter((r) => r.role === "RN");
  let swapReq: (typeof rows)[number] | undefined;
  let swapTgt: (typeof rows)[number] | undefined;
  for (const a of rnRows) {
    if (usedStaff.has(a.staffId)) continue;
    for (const b of rnRows) {
      if (b.staffId === a.staffId) continue;
      if (usedStaff.has(b.staffId)) continue;
      if (b.shiftDate === a.shiftDate) continue;
      swapReq = a;
      swapTgt = b;
      break;
    }
    if (swapReq) break;
  }
  // Fall back to any two distinct-date RNs if the not-yet-used constraint is too
  // tight on a small roster (still avoids reusing the same nurse on both sides).
  if (!swapReq || !swapTgt) {
    for (const a of rnRows) {
      for (const b of rnRows) {
        if (b.staffId === a.staffId) continue;
        if (b.shiftDate === a.shiftDate) continue;
        swapReq = a;
        swapTgt = b;
        break;
      }
      if (swapReq) break;
    }
  }

  if (!leaveACandidate || !leaveBCandidate || !swapReq || !swapTgt) {
    const missing: string[] = [];
    if (!leaveACandidate)
      missing.push(
        "an assigned shift 2-6 days from today (short-notice example)",
      );
    if (!leaveBCandidate)
      missing.push(
        "an assigned shift 8-14 days out on a different nurse (planned-leave example)",
      );
    if (!swapReq || !swapTgt)
      missing.push(
        "two RNs with assigned shifts on different dates (swap example)",
      );
    return NextResponse.json(
      {
        error: `Your published schedule can't support practice mode yet — it is missing ${missing.join(
          "; ",
        )}. Publishing a full schedule period that starts within the next few days fixes this.`,
      },
      { status: 422 },
    );
  }

  const created = db.transaction(() => {
    const leaveA = db
      .insert(staffLeave)
      .values({
        staffId: leaveACandidate.staffId,
        leaveType: "personal",
        startDate: leaveACandidate.shiftDate,
        endDate: leaveACandidate.shiftDate,
        status: "pending",
        notes: LEAVE_A_NOTE,
        reason: LEAVE_A_NOTE,
      })
      .returning()
      .get();

    const leaveB = db
      .insert(staffLeave)
      .values({
        staffId: leaveBCandidate.staffId,
        leaveType: "personal",
        startDate: leaveBCandidate.shiftDate,
        endDate: leaveBCandidate.shiftDate,
        status: "pending",
        notes: LEAVE_B_NOTE,
        reason: LEAVE_B_NOTE,
      })
      .returning()
      .get();

    const swap = db
      .insert(shiftSwapRequest)
      .values({
        requestingAssignmentId: swapReq!.assignmentId,
        requestingStaffId: swapReq!.staffId,
        targetAssignmentId: swapTgt!.assignmentId,
        targetStaffId: swapTgt!.staffId,
        status: "pending",
        notes: SWAP_NOTE,
      })
      .returning()
      .get();

    return { leaveA, leaveB, swap };
  });

  return NextResponse.json(
    {
      created: {
        leaveA: {
          id: created.leaveA.id,
          staff: `${leaveACandidate.staffFirstName} ${leaveACandidate.staffLastName}`,
          date: leaveACandidate.shiftDate,
          daysOut: daysFromToday(leaveACandidate.shiftDate),
        },
        leaveB: {
          id: created.leaveB.id,
          staff: `${leaveBCandidate.staffFirstName} ${leaveBCandidate.staffLastName}`,
          date: leaveBCandidate.shiftDate,
          daysOut: daysFromToday(leaveBCandidate.shiftDate),
        },
        swap: {
          id: created.swap.id,
          requesting: `${swapReq.staffFirstName} ${swapReq.staffLastName}`,
          target: `${swapTgt.staffFirstName} ${swapTgt.staffLastName}`,
          requestingDate: swapReq.shiftDate,
          targetDate: swapTgt.shiftDate,
        },
      },
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// Shared: locate the practice records + the assignments the leaves affect.
// ---------------------------------------------------------------------------
interface PracticeLeaveRow {
  id: string;
  staffId: string;
  startDate: string;
  endDate: string;
  status: string;
  notes: string | null;
  staffFirstName: string | null;
  staffLastName: string | null;
}

function findPracticeLeaves(): {
  leaveA: PracticeLeaveRow | null;
  leaveB: PracticeLeaveRow | null;
} {
  const leaves = db
    .select({
      id: staffLeave.id,
      staffId: staffLeave.staffId,
      startDate: staffLeave.startDate,
      endDate: staffLeave.endDate,
      status: staffLeave.status,
      notes: staffLeave.notes,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
    })
    .from(staffLeave)
    .leftJoin(staff, eq(staffLeave.staffId, staff.id))
    .where(like(staffLeave.notes, `%${PRACTICE}%`))
    .all();

  const leaveA =
    leaves.find((l) => (l.notes ?? "").includes(LEAVE_A_NOTE)) ?? null;
  const leaveB =
    leaves.find((l) => (l.notes ?? "").includes(LEAVE_B_NOTE)) ?? null;
  return { leaveA, leaveB };
}

/** Full name for a practice leave row, or null when the staff join is empty. */
function leaveStaffName(l: PracticeLeaveRow | null): string | null {
  if (!l) return null;
  const name = `${l.staffFirstName ?? ""} ${l.staffLastName ?? ""}`.trim();
  return name.length > 0 ? name : null;
}

interface PracticeSwapRow {
  id: string;
  status: string;
  requestingStaffId: string;
  targetStaffId: string | null;
  requestingFirstName: string | null;
  requestingLastName: string | null;
  targetFirstName: string | null;
  targetLastName: string | null;
}

function findPracticeSwap(): PracticeSwapRow | null {
  const requestingStaff = aliasedTable(staff, "requesting_staff");
  const targetStaff = aliasedTable(staff, "target_staff");
  return (
    db
      .select({
        id: shiftSwapRequest.id,
        status: shiftSwapRequest.status,
        requestingStaffId: shiftSwapRequest.requestingStaffId,
        targetStaffId: shiftSwapRequest.targetStaffId,
        requestingFirstName: requestingStaff.firstName,
        requestingLastName: requestingStaff.lastName,
        targetFirstName: targetStaff.firstName,
        targetLastName: targetStaff.lastName,
      })
      .from(shiftSwapRequest)
      .leftJoin(
        requestingStaff,
        eq(shiftSwapRequest.requestingStaffId, requestingStaff.id),
      )
      .leftJoin(targetStaff, eq(shiftSwapRequest.targetStaffId, targetStaff.id))
      .where(like(shiftSwapRequest.notes, `%${PRACTICE}%`))
      .get() ?? null
  );
}

/** Join a first/last name pair into a display name, or null when absent. */
function joinName(
  first: string | null | undefined,
  last: string | null | undefined,
): string | null {
  const name = `${first ?? ""} ${last ?? ""}`.trim();
  return name.length > 0 ? name : null;
}

/**
 * The assignments a practice leave affects: the leave's staff member, in the
 * leave's date window. These are the rows the approval flow cancels and pins its
 * generated callout/open-shift to (callout.assignmentId / openShift.originalAssignmentId).
 * We match on ANY status so a filled/cancelled assignment is still found for teardown.
 */
function affectedAssignmentIds(leave: PracticeLeaveRow): string[] {
  return db
    .select({ id: assignment.id })
    .from(assignment)
    .innerJoin(shift, eq(assignment.shiftId, shift.id))
    .where(
      and(
        eq(assignment.staffId, leave.staffId),
        gte(shift.date, leave.startDate),
        lte(shift.date, leave.endDate),
      ),
    )
    .all()
    .map((r) => r.id);
}

// ---------------------------------------------------------------------------
// GET — status of the practice chain
// ---------------------------------------------------------------------------
export async function GET() {
  const { leaveA, leaveB } = findPracticeLeaves();
  const swap = findPracticeSwap();

  const active = !!(leaveA || leaveB || swap);

  // The callout is generated by approving Leave A; the open shift by Leave B.
  // Join via the affected assignment (the approval pins callout.assignmentId /
  // openShift.originalAssignmentId to the assignment it cancelled).
  let generatedCallout: { id: string; status: string } | null = null;
  let generatedOpenShift: { id: string; status: string } | null = null;

  if (leaveA) {
    const ids = affectedAssignmentIds(leaveA);
    if (ids.length > 0) {
      const c = db
        .select({ id: callout.id, status: callout.status })
        .from(callout)
        .where(inArray(callout.assignmentId, ids))
        .get();
      if (c) generatedCallout = c;
    }
  }

  if (leaveB) {
    const ids = affectedAssignmentIds(leaveB);
    if (ids.length > 0) {
      const o = db
        .select({ id: openShift.id, status: openShift.status })
        .from(openShift)
        .where(inArray(openShift.originalAssignmentId, ids))
        .get();
      if (o) generatedOpenShift = o;
    }
  }

  return NextResponse.json({
    active,
    items: {
      leaveA: leaveA
        ? {
            id: leaveA.id,
            status: leaveA.status,
            staffName: leaveStaffName(leaveA),
            date: leaveA.startDate,
          }
        : null,
      leaveB: leaveB
        ? {
            id: leaveB.id,
            status: leaveB.status,
            staffName: leaveStaffName(leaveB),
            date: leaveB.startDate,
          }
        : null,
      swap: swap
        ? {
            id: swap.id,
            status: swap.status,
            requestingName: joinName(
              swap.requestingFirstName,
              swap.requestingLastName,
            ),
            targetName: joinName(swap.targetFirstName, swap.targetLastName),
          }
        : null,
      generatedCallout,
      generatedOpenShift,
    },
  });
}

// ---------------------------------------------------------------------------
// DELETE — deterministic teardown of the whole chain (idempotent)
// ---------------------------------------------------------------------------
export async function DELETE() {
  const removed = {
    swaps: 0,
    callouts: 0,
    openShifts: 0,
    replacementAssignments: 0,
    restoredAssignments: 0,
    leaves: 0,
  };

  const { leaveA, leaveB } = findPracticeLeaves();
  const swap = findPracticeSwap();

  db.transaction(() => {
    // 1. Delete the practice swap (any status). Approving a directed swap only
    // moves staffId on the two existing assignments — no rows to clean up beyond
    // the request itself; the assignments belong to the real schedule and the
    // nurses simply swap back conceptually. We do not un-swap because a directed
    // swap leaves both assignments valid and assigned (the exception log records it).
    if (swap) {
      db.delete(shiftSwapRequest).where(eq(shiftSwapRequest.id, swap.id)).run();
      removed.swaps += 1;
    }

    // 2. For each practice leave, revert its generated coverage records.
    for (const leave of [leaveA, leaveB]) {
      if (!leave) continue;
      const ids = affectedAssignmentIds(leave);
      if (ids.length === 0) {
        db.delete(staffLeave).where(eq(staffLeave.id, leave.id)).run();
        removed.leaves += 1;
        continue;
      }

      // 2a. Generated callout (from Leave A, short-notice path).
      const callouts = db
        .select()
        .from(callout)
        .where(inArray(callout.assignmentId, ids))
        .all();
      for (const c of callouts) {
        // If FILLED, the fill flow created a replacement assignment
        // (assignmentSource callout_replacement, on this shift, the replacement
        // staff) and set the original to "called_out". Delete the replacement.
        if (c.replacementStaffId) {
          const del = db
            .delete(assignment)
            .where(
              and(
                eq(assignment.shiftId, c.shiftId),
                eq(assignment.staffId, c.replacementStaffId),
                eq(assignment.assignmentSource, "callout_replacement"),
              ),
            )
            .run();
          removed.replacementAssignments += del.changes ?? 0;
        }
        db.delete(callout).where(eq(callout.id, c.id)).run();
        removed.callouts += 1;
      }

      // 2b. Generated open shift (from Leave B, planned path).
      const openShifts = db
        .select()
        .from(openShift)
        .where(inArray(openShift.originalAssignmentId, ids))
        .all();
      for (const o of openShifts) {
        // Order matters: open_shift.filled_by_assignment_id has a FK to
        // assignment with NO onDelete action, so deleting the replacement
        // assignment while this open_shift still points at it raises
        // "FOREIGN KEY constraint failed" and rolls back the WHOLE teardown —
        // the founder's approved chain then survived removal entirely. Delete
        // the open_shift row FIRST (it also references originalAssignmentId,
        // which we restore below), THEN the replacement assignment it named.
        const filledBy = o.filledByAssignmentId;
        db.delete(openShift).where(eq(openShift.id, o.id)).run();
        removed.openShifts += 1;
        if (filledBy) {
          const del = db
            .delete(assignment)
            .where(eq(assignment.id, filledBy))
            .run();
          removed.replacementAssignments += del.changes ?? 0;
        }
      }

      // 2c. Restore the affected assignments the approval mutated. The leave
      // approval sets them "cancelled"; a callout/open-shift fill sets the
      // original "called_out". Either way, restore to "assigned".
      const restore = db
        .update(assignment)
        .set({ status: "assigned", updatedAt: new Date().toISOString() })
        .where(
          and(
            inArray(assignment.id, ids),
            or(
              eq(assignment.status, "cancelled"),
              eq(assignment.status, "called_out"),
            ),
          ),
        )
        .run();
      removed.restoredAssignments += restore.changes ?? 0;

      // Replacements were deleted and originals restored — rebuild the
      // holiday credit for the shifts involved.
      syncHolidayRowsForShifts(
        db
          .select({ shiftId: assignment.shiftId })
          .from(assignment)
          .where(inArray(assignment.id, ids))
          .all()
          .map((r) => r.shiftId),
      );

      // 2d. Delete the leave row.
      db.delete(staffLeave).where(eq(staffLeave.id, leave.id)).run();
      removed.leaves += 1;
    }

    // NOTE: exceptionLog rows with "[PRACTICE]" in the description are LEFT
    // INTACT on purpose — the audit trail is the lesson of tutorial step 6.
  });

  return NextResponse.json({ removed });
}
