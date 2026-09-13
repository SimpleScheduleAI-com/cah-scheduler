/**
 * Phase 3 in-app notifications — insert helper + pure per-event composers.
 *
 * Design:
 * - The composers are PURE: given the event facts they return a NotificationDraft
 *   (staffId, type, title, body, href). They import nothing and touch no DB, so
 *   they are fully unit-testable (title/body wording is what tends to regress).
 * - `insertNotification` is the only DB touch. It is db-agnostic: it takes a
 *   drizzle-style `db` with `.insert(table).values(row).run()` and the
 *   notification table, so route handlers pass `db` from "@/db". This keeps the
 *   helper importable in tests without pulling in better-sqlite3.
 * - Notifications are a BEST-EFFORT side effect. Callers wrap every notify call
 *   in try/catch that logs — a failure to notify must never break the main
 *   mutation (a published schedule, an approved swap, a decided leave).
 */

export type NotificationType =
  | "schedule_published"
  | "swap_requested"
  | "swap_response"
  | "swap_decided"
  | "leave_decided"
  | "open_shift_posted"
  | "open_shift_decided"
  | "callout_posted"
  | "assignment_amended";

/** The pure output of a composer — everything needed to insert one row. */
export interface NotificationDraft {
  staffId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
}

// ---------------------------------------------------------------------------
// Insert helper (the only DB touch)
// ---------------------------------------------------------------------------

/** The row we hand to drizzle's `.values(...)`. */
type NotificationRow = {
  staffId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
};

/**
 * Minimal structural shape of the drizzle db we need — `db.insert(table)` must
 * expose a `.values(row).run()` chain. `table` and the builder are generic so
 * the real BetterSQLite3Database (whose builder has many extra methods) matches
 * structurally, while tests can pass a tiny stub. The row is constrained to
 * NotificationRow so a typo in the draft is still caught.
 */
interface InsertableDb {
  insert: (table: unknown) => {
    values: (row: NotificationRow) => { run: () => unknown };
  };
}

/**
 * Insert one notification. `notificationTable` is the drizzle table object
 * (schema.notification). Synchronous to match better-sqlite3. Callers must
 * still wrap this in try/catch — see the trigger sites.
 *
 * The db is accepted as `unknown` then narrowed, because the real drizzle db's
 * insert-builder type is far wider than the `.values().run()` slice we use;
 * narrowing here keeps the call sites clean without leaking `any`.
 */
export function insertNotification(
  db: unknown,
  notificationTable: unknown,
  draft: NotificationDraft,
): void {
  const insertable = db as InsertableDb;
  insertable
    .insert(notificationTable)
    .values({
      staffId: draft.staffId,
      type: draft.type,
      title: draft.title,
      body: draft.body,
      href: draft.href,
    })
    .run();
}

// ---------------------------------------------------------------------------
// Pure composers — one per event. Each returns a NotificationDraft.
// ---------------------------------------------------------------------------

/**
 * A draft schedule was published. Notify each staff member with a live
 * assignment in it. `scheduleName`, `startDate`, `endDate` are the schedule's
 * own fields; dates are the raw YYYY-MM-DD strings.
 */
export function composeSchedulePublished(params: {
  staffId: string;
  scheduleName: string;
  startDate: string;
  endDate: string;
}): NotificationDraft {
  return {
    staffId: params.staffId,
    type: "schedule_published",
    title: "New schedule published",
    body: `${params.scheduleName}: ${params.startDate} – ${params.endDate}`,
    href: "/my",
  };
}

/**
 * A directed swap was created — notify the TARGET nurse that a colleague wants
 * to swap a specific shift for one of theirs.
 */
export function composeSwapRequested(params: {
  targetStaffId: string;
  requesterName: string;
  requesterShiftDate: string | null;
  targetShiftDate: string | null;
}): NotificationDraft {
  const theirs = params.requesterShiftDate ?? "their shift";
  const yours = params.targetShiftDate ?? "your shift";
  return {
    staffId: params.targetStaffId,
    type: "swap_requested",
    title: `Swap request from ${params.requesterName}`,
    body: `${theirs} ↔ ${yours}`,
    href: "/my/swaps",
  };
}

/**
 * The target nurse accepted or declined a directed swap — notify the REQUESTER.
 * Accept keeps the swap pending for manager approval; decline ends it.
 */
export function composeSwapResponse(params: {
  requestingStaffId: string;
  targetName: string;
  action: "accept" | "decline";
}): NotificationDraft {
  const accepted = params.action === "accept";
  return {
    staffId: params.requestingStaffId,
    type: "swap_response",
    title: accepted
      ? `${params.targetName} accepted your swap`
      : `${params.targetName} declined your swap`,
    body: accepted
      ? "Accepted — awaiting manager approval."
      : `Your swap request was declined by ${params.targetName}.`,
    href: "/my/swaps",
  };
}

/**
 * A manager approved or denied a swap. Notify one party (the requester, and the
 * target too for directed swaps — the caller composes one draft per recipient).
 */
export function composeSwapDecided(params: {
  staffId: string;
  outcome: "approved" | "denied";
}): NotificationDraft {
  const approved = params.outcome === "approved";
  return {
    staffId: params.staffId,
    type: "swap_decided",
    title: approved ? "Swap approved" : "Swap denied",
    body: approved
      ? "Your manager approved the shift swap."
      : "Your manager denied the shift swap.",
    href: "/my/swaps",
  };
}

/**
 * A manager approved or denied a leave request — notify the requesting nurse.
 */
export function composeLeaveDecided(params: {
  staffId: string;
  outcome: "approved" | "denied";
  startDate: string;
  endDate: string;
}): NotificationDraft {
  const approved = params.outcome === "approved";
  return {
    staffId: params.staffId,
    type: "leave_decided",
    title: approved ? "Leave approved" : "Leave denied",
    body: `${params.startDate} – ${params.endDate}`,
    href: "/my/leave",
  };
}

/**
 * An open shift was posted that this nurse is rule-eligible to cover. Sent to
 * EVERY eligible nurse, not a top-3 — visibility is not a recommendation
 * (founder direction 2026-08-15). Raising a hand is interest only; the
 * manager confirms the fill.
 */
export function composeOpenShiftPosted(params: {
  staffId: string;
  date: string;
  shiftLabel: string;
  unit: string;
}): NotificationDraft {
  return {
    staffId: params.staffId,
    type: "open_shift_posted",
    title: "Open shift you could pick up",
    body: `${params.shiftLabel} on ${params.date} (${params.unit}) needs coverage. Interested? Raise your hand from your schedule page.`,
    href: "/my",
  };
}

/**
 * A callout was created for a shift at least one full day away (approved
 * leave inside the unit's callout threshold). The manager works the
 * escalation chain, but the nurses who could cover it should know it is
 * open — a night nurse should hear that a night shift is vacant (founder
 * direction 2026-09-13, after the Dr. Tara demo). Same-day and past-dated
 * callouts are NOT posted: with hours to go, a board notification is noise.
 * There is no open-shift row to raise a hand on, so the nurse is told to
 * contact the manager.
 */
export function composeCalloutPosted(params: {
  staffId: string;
  date: string;
  shiftLabel: string;
  unit: string;
  daysUntilShift: number;
}): NotificationDraft {
  const when =
    params.daysUntilShift === 1
      ? "tomorrow"
      : `in ${params.daysUntilShift} days`;
  return {
    staffId: params.staffId,
    type: "callout_posted",
    title: "Urgent: shift needs coverage",
    body: `${params.shiftLabel} on ${params.date} (${params.unit}) is ${when} and needs coverage. Tell your manager if you can cover it.`,
    href: "/my",
  };
}

/**
 * A manager changed a PUBLISHED schedule by hand — this nurse was added to or
 * removed from a shift. Only the affected nurse is told; the rest of the unit
 * does not get a second "new schedule" alert for a one-person change.
 */
export function composeAssignmentAmended(params: {
  staffId: string;
  change: "added" | "removed";
  date: string;
  shiftLabel: string;
  unit: string;
  reason: string;
}): NotificationDraft {
  const added = params.change === "added";
  return {
    staffId: params.staffId,
    type: "assignment_amended",
    title: added
      ? "You were added to a published shift"
      : "You were removed from a published shift",
    body: `${params.shiftLabel} on ${params.date} (${params.unit}). Reason: ${params.reason}`,
    href: "/my",
  };
}
