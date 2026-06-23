import { db } from "@/db";
import { schedule, assignment, shift } from "@/db/schema";
import { eq, and, ne, gte, lte } from "drizzle-orm";
import { isWeekend, addDays } from "@/lib/date/week";

/**
 * Shared read helpers describing a staff member's recent/period history.
 *
 * Extracted from callout/escalation.ts and coverage/find-candidates.ts, which
 * each carried byte-identical copies. Keeping one definition prevents the two
 * from drifting apart (the way a week-boundary helper once did).
 */

/**
 * Role hierarchy: a replacement must have equal or higher rank than the
 * called-out nurse. A CNA cannot perform RN duties regardless of availability.
 */
export const ROLE_RANK: Record<string, number> = { RN: 3, LPN: 2, CNA: 1 };

/**
 * Count individual weekend days (Saturday/Sunday) a staff member is already
 * assigned to within the schedule period. Counts days, not weekend rotations.
 */
export function countWeekendsInSchedulePeriod(staffId: string, scheduleId: string): number {
  const sched = db
    .select({ startDate: schedule.startDate, endDate: schedule.endDate })
    .from(schedule)
    .where(eq(schedule.id, scheduleId))
    .get();
  if (!sched) return 0;

  const rows = db
    .select({ date: shift.date })
    .from(assignment)
    .innerJoin(shift, eq(assignment.shiftId, shift.id))
    .where(
      and(
        eq(assignment.staffId, staffId),
        gte(shift.date, sched.startDate),
        lte(shift.date, sched.endDate),
        ne(assignment.status, "cancelled")
      )
    )
    .all();

  return rows.filter((r) => isWeekend(r.date)).length;
}

/**
 * Count consecutive working days ending the day before `shiftDate`. Walks back
 * up to 7 days, stopping at the first day with no (non-cancelled) assignment.
 */
export function countConsecutiveDaysBefore(staffId: string, shiftDate: string): number {
  let count = 0;
  for (let i = 1; i <= 7; i++) {
    const dateStr = addDays(shiftDate, -i);
    const hasShift = db
      .select({ id: assignment.id })
      .from(assignment)
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .where(
        and(
          eq(assignment.staffId, staffId),
          eq(shift.date, dateStr),
          ne(assignment.status, "cancelled")
        )
      )
      .get();
    if (!hasShift) break;
    count++;
  }
  return count;
}
