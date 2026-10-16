/**
 * Keeps `staff_holiday_assignment` (the annual "who worked which holiday"
 * ledger read by the Holiday Fairness (Annual) rule) in step with the
 * `assignment` table.
 *
 * Invariant: for every schedule, the ledger rows tied to that schedule's
 * shifts are exactly the (nurse, logical holiday, year) triples its live
 * assignments produce. The assignment table always holds the CHOSEN draft
 * (Balanced at generation, or whichever scenario was applied), so the ledger
 * follows the chosen/posted schedule.
 *
 * Before v1.11.1 two paths broke this: regeneration deleted assignments but
 * left the old ledger rows (and the unique index then silently kept the stale
 * owner), and applying the Fairness/Cost draft never touched the ledger. A
 * nurse could be credited with a holiday the posted schedule gave to someone
 * else.
 *
 * All functions here are synchronous and do NOT open their own transaction —
 * call them inside the caller's `db.transaction(...)` so the ledger and the
 * assignments commit together (better-sqlite3 has one connection, so `db.*`
 * calls inside a transaction callback are part of it).
 */
import { db } from "@/db";
import {
  assignment,
  publicHoliday,
  schedule,
  shift,
  staffHolidayAssignment,
} from "@/db/schema";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { yearOfDateString } from "./standard-holidays";

/**
 * Holiday groups — working either Christmas Eve OR Christmas Day counts as
 * "worked Christmas". Mirrors the Holiday Fairness rule.
 */
const HOLIDAY_GROUPS: Record<string, string> = {
  "Christmas Eve": "Christmas",
  "Christmas Day": "Christmas",
};

export function getLogicalHolidayName(name: string): string {
  return HOLIDAY_GROUPS[name] ?? name;
}

/** Same exclusions the rule engine uses when loading a schedule's assignments. */
const NOT_WORKED_STATUSES = ["called_out", "cancelled", "swapped"] as const;

/** One live assignment that falls on an active public holiday. */
export interface HolidayWork {
  staffId: string;
  holidayName: string;
  year: number;
  shiftId: string;
  assignmentId: string;
  scheduleId: string;
  date: string;
}

type LedgerKey = string;

function keyOf(r: {
  staffId: string;
  holidayName: string;
  year: number;
}): LedgerKey {
  return `${r.staffId}|${r.holidayName}|${r.year}`;
}

/**
 * Every live assignment on an active public holiday, optionally limited to
 * `years`, sorted by date then assignment id (deterministic source choice).
 */
export function loadHolidayWork(years?: number[]): HolidayWork[] {
  const holidays = db
    .select()
    .from(publicHoliday)
    .where(eq(publicHoliday.isActive, true))
    .all()
    .filter((h) => !years || years.includes(yearOfDateString(h.date)));
  if (holidays.length === 0) return [];

  const dateToName = new Map<string, string>();
  for (const h of holidays) {
    dateToName.set(h.date, getLogicalHolidayName(h.name));
  }

  const rows = db
    .select({
      assignmentId: assignment.id,
      staffId: assignment.staffId,
      shiftId: assignment.shiftId,
      scheduleId: assignment.scheduleId,
      date: shift.date,
    })
    .from(assignment)
    .innerJoin(shift, eq(assignment.shiftId, shift.id))
    .where(
      and(
        inArray(shift.date, [...dateToName.keys()]),
        notInArray(assignment.status, [...NOT_WORKED_STATUSES]),
      ),
    )
    .all();

  return rows
    .map((r) => ({
      ...r,
      holidayName: dateToName.get(r.date)!,
      year: yearOfDateString(r.date),
    }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.assignmentId.localeCompare(b.assignmentId),
    );
}

/** Calendar years touched by an inclusive YYYY-MM-DD range. */
function yearsInRange(startDate: string, endDate: string): number[] {
  const out: number[] = [];
  for (
    let y = yearOfDateString(startDate);
    y <= yearOfDateString(endDate);
    y++
  ) {
    out.push(y);
  }
  return out;
}

/**
 * Rewrite the ledger rows for one schedule from its current assignments.
 *
 * 1. Delete every ledger row tied to this schedule's shifts.
 * 2. For each (nurse, holiday, year) that was deleted or that this schedule's
 *    live assignments now produce, insert one row if no row exists yet —
 *    sourced from this schedule when possible, otherwise from another
 *    schedule's assignment. The fallback matters for grouped holidays that
 *    can straddle two periods (Christmas Eve ends one schedule, Christmas Day
 *    starts the next): only one row per nurse/holiday/year is allowed, so
 *    removing this schedule's row must hand the credit to the other one.
 *
 * Rows for other schedules' keys, and rows with no shift link, are untouched.
 * Idempotent. Call inside a transaction.
 */
export function syncScheduleHolidayRows(scheduleId: string): {
  removed: number;
  inserted: number;
} {
  const scheduleShiftIds = db
    .select({ id: shift.id })
    .from(shift)
    .where(eq(shift.scheduleId, scheduleId));

  const oldRows = db
    .select()
    .from(staffHolidayAssignment)
    .where(inArray(staffHolidayAssignment.shiftId, scheduleShiftIds))
    .all();
  if (oldRows.length > 0) {
    db.delete(staffHolidayAssignment)
      .where(
        inArray(
          staffHolidayAssignment.id,
          oldRows.map((r) => r.id),
        ),
      )
      .run();
  }

  const sched = db
    .select({ startDate: schedule.startDate, endDate: schedule.endDate })
    .from(schedule)
    .where(eq(schedule.id, scheduleId))
    .get();
  const years = new Set<number>(oldRows.map((r) => r.year));
  if (sched) {
    for (const y of yearsInRange(sched.startDate, sched.endDate)) years.add(y);
  }
  if (years.size === 0) return { removed: oldRows.length, inserted: 0 };
  const yearList = [...years];

  const work = loadHolidayWork(yearList);
  const affected = new Set<LedgerKey>(oldRows.map(keyOf));
  for (const w of work) {
    if (w.scheduleId === scheduleId) affected.add(keyOf(w));
  }

  const existing = new Set<LedgerKey>(
    db
      .select()
      .from(staffHolidayAssignment)
      .where(inArray(staffHolidayAssignment.year, yearList))
      .all()
      .map(keyOf),
  );

  // This schedule's assignments first, then date order (loadHolidayWork sort).
  const ordered = [
    ...work.filter((w) => w.scheduleId === scheduleId),
    ...work.filter((w) => w.scheduleId !== scheduleId),
  ];
  let inserted = 0;
  for (const w of ordered) {
    const k = keyOf(w);
    if (!affected.has(k) || existing.has(k)) continue;
    db.insert(staffHolidayAssignment)
      .values({
        staffId: w.staffId,
        holidayName: w.holidayName,
        year: w.year,
        shiftId: w.shiftId,
        assignmentId: w.assignmentId,
      })
      .run();
    existing.add(k);
    inserted++;
  }

  return { removed: oldRows.length, inserted };
}

/**
 * Re-sync the ledger for every schedule that owns one of `shiftIds`.
 *
 * Daily operations (callouts, coverage fills, swaps, leave approval, manual
 * edits, practice-mode teardown) change WHO works a shift after the schedule
 * is chosen. Each of them calls this inside its own transaction, right after
 * changing the assignment rows, so the ledger commits with them.
 *
 * Skips the work entirely when none of the shifts falls on an active public
 * holiday: a non-holiday shift cannot change anyone's holiday credit, and the
 * full sync would otherwise also prune rows for holidays that were later
 * switched off, which is the repair script's job, not a callout's.
 */
export function syncHolidayRowsForShifts(
  shiftIds: (string | null | undefined)[],
): void {
  const ids = [...new Set(shiftIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  const shifts = db
    .select({ scheduleId: shift.scheduleId, date: shift.date })
    .from(shift)
    .where(inArray(shift.id, ids))
    .all();
  if (shifts.length === 0) return;
  const holidayDates = new Set(
    db
      .select({ date: publicHoliday.date })
      .from(publicHoliday)
      .where(
        and(
          eq(publicHoliday.isActive, true),
          inArray(
            publicHoliday.date,
            shifts.map((s) => s.date),
          ),
        ),
      )
      .all()
      .map((h) => h.date),
  );
  const scheduleIds = new Set(
    shifts.filter((s) => holidayDates.has(s.date)).map((s) => s.scheduleId),
  );
  for (const scheduleId of scheduleIds) syncScheduleHolidayRows(scheduleId);
}

export interface LedgerRepairPlan {
  /** Rows to delete: no live holiday assignment backs them. */
  remove: (typeof staffHolidayAssignment.$inferSelect)[];
  /** Rows to insert: a live holiday assignment with no ledger row. */
  add: HolidayWork[];
  /** Rows whose key is right but whose shift/assignment link is stale. */
  repoint: {
    row: typeof staffHolidayAssignment.$inferSelect;
    source: HolidayWork;
  }[];
}

/**
 * Compare the whole ledger with what the assignment table says (every
 * schedule, every year). Read-only. Used by
 * scripts/repair-holiday-assignments.ts.
 *
 * Note: rows that no live assignment backs are planned for removal. That
 * includes rows left behind by deleted schedules or by assignments that were
 * later called out / cancelled / swapped — the posted schedule no longer has
 * that nurse on the holiday.
 */
export function planLedgerRepair(): LedgerRepairPlan {
  const work = loadHolidayWork();
  const desired = new Map<LedgerKey, HolidayWork[]>();
  for (const w of work) {
    const k = keyOf(w);
    const list = desired.get(k) ?? [];
    list.push(w);
    desired.set(k, list);
  }

  const rows = db.select().from(staffHolidayAssignment).all();
  const plan: LedgerRepairPlan = { remove: [], add: [], repoint: [] };
  const kept = new Set<LedgerKey>();

  for (const row of rows) {
    const k = keyOf(row);
    const sources = desired.get(k);
    if (!sources || kept.has(k)) {
      // Unbacked, or a duplicate key (impossible under the unique index, but
      // harmless to handle).
      plan.remove.push(row);
      continue;
    }
    kept.add(k);
    const linked = sources.some(
      (s) => s.assignmentId === row.assignmentId && s.shiftId === row.shiftId,
    );
    if (!linked) plan.repoint.push({ row, source: sources[0] });
  }

  for (const [k, sources] of desired) {
    if (!kept.has(k)) plan.add.push(sources[0]);
  }
  return plan;
}

/** Apply a plan from planLedgerRepair(). Call inside a transaction. */
export function applyLedgerRepair(plan: LedgerRepairPlan): void {
  if (plan.remove.length > 0) {
    db.delete(staffHolidayAssignment)
      .where(
        inArray(
          staffHolidayAssignment.id,
          plan.remove.map((r) => r.id),
        ),
      )
      .run();
  }
  for (const { row, source } of plan.repoint) {
    db.update(staffHolidayAssignment)
      .set({ shiftId: source.shiftId, assignmentId: source.assignmentId })
      .where(eq(staffHolidayAssignment.id, row.id))
      .run();
  }
  for (const w of plan.add) {
    db.insert(staffHolidayAssignment)
      .values({
        staffId: w.staffId,
        holidayName: w.holidayName,
        year: w.year,
        shiftId: w.shiftId,
        assignmentId: w.assignmentId,
      })
      .run();
  }
}
