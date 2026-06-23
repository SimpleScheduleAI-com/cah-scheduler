import type { StaffInfo, ShiftInfo } from "@/lib/engine/rules/types";
import type { SchedulerContext } from "./types";
import { SchedulerState, toDateTime, shiftEndDateTime } from "./state";

import { isICUUnit } from "@/lib/engine/unit-utils";

// Re-exported so existing imports keep working; the implementation now lives
// in unit-utils.ts and is shared with the rule evaluators.
export { isICUUnit };

/**
 * Returns true if assigning `staffInfo` to `shiftInfo` passes every hard rule.
 * Checks are ordered by cost — cheapest first, most expensive last.
 */
export function passesHardRules(
  staffInfo: StaffInfo,
  shiftInfo: ShiftInfo,
  state: SchedulerState,
  context: SchedulerContext
): boolean {
  const newStart = toDateTime(shiftInfo.date, shiftInfo.startTime);
  const newEnd = shiftEndDateTime(shiftInfo.date, shiftInfo.startTime, shiftInfo.durationHours);

  // 1. Approved leave blocks assignment
  const onLeave = context.staffLeaves.some(
    (l) =>
      l.staffId === staffInfo.id &&
      l.status === "approved" &&
      l.startDate <= shiftInfo.date &&
      l.endDate >= shiftInfo.date
  );
  if (onLeave) return false;

  // 2. PRN availability (per-diem must have submitted this date)
  if (staffInfo.employmentType === "per_diem") {
    const avail = context.prnAvailability.find((a) => a.staffId === staffInfo.id);
    if (!avail || !avail.availableDates.includes(shiftInfo.date)) return false;
  }

  // 3. ICU/ER competency (level ≥ 2)
  if (isICUUnit(shiftInfo.unit) && staffInfo.icuCompetencyLevel < 2) return false;

  // 3b. Level 1 staff require a Level 5 preceptor already on the same shift.
  //     Prevents assigning a Level 1 novice unless a preceptor is confirmed first.
  if (staffInfo.icuCompetencyLevel === 1) {
    const hasLevel5 = state
      .getShiftAssignments(shiftInfo.id)
      .some((a) => (context.staffMap.get(a.staffId)?.icuCompetencyLevel ?? 0) === 5);
    if (!hasLevel5) return false;
  }

  // 3c. Level 2 staff on ICU/ER require a Level 4+ supervisor already on the same shift.
  //     The greedy pre-pass fills that Level 4+ slot first; if it couldn't, Level 2
  //     staff are also excluded from regular slots, leaving the shift understaffed.
  if (isICUUnit(shiftInfo.unit) && staffInfo.icuCompetencyLevel === 2) {
    const hasLevel4Plus = state
      .getShiftAssignments(shiftInfo.id)
      .some((a) => (context.staffMap.get(a.staffId)?.icuCompetencyLevel ?? 0) >= 4);
    if (!hasLevel4Plus) return false;
  }

  // 4. No overlapping shifts
  if (state.hasOverlapWith(staffInfo.id, newStart, newEnd)) return false;

  // 5a. Min rest before this shift — previous shift must have ended ≥ 10h ago
  const lastEnd = state.getLastShiftEndBefore(staffInfo.id, newStart);
  if (lastEnd) {
    const restHours = (newStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
    if (restHours < 10) return false;
  }

  // 5b. Min rest after this shift — next existing shift must start ≥ 10h after newEnd.
  //     This catches the case where all nights are processed before days (by difficulty
  //     ordering) and a staff already has a same-day night shift starting after newEnd.
  const nextStart = state.getNextShiftStartAfter(staffInfo.id, newEnd);
  if (nextStart) {
    const restHoursAfter = (nextStart.getTime() - newEnd.getTime()) / (1000 * 60 * 60);
    if (restHoursAfter < 10) return false;
  }

  // 6. Max consecutive days (cap at 5; staff preference may be lower)
  const maxConsec = Math.min(staffInfo.preferences?.maxConsecutiveDays ?? 5, 5);
  if (state.wouldExceedConsecutiveDays(staffInfo.id, shiftInfo.date, maxConsec)) return false;

  // 7. Max 60 hours in any rolling 7-day window.
  // Checks all 7 windows containing shiftInfo.date — not just the backward window —
  // to catch cases where already-assigned future shifts (placed first by the
  // most-constrained-first ordering) would create an over-limit window.
  if (state.wouldExceed7DayHours(staffInfo.id, shiftInfo.date, shiftInfo.durationHours, 60)) return false;

  // 8. On-call limits
  if (shiftInfo.shiftType === "on_call") {
    const maxPerWeek = context.unitConfig?.maxOnCallPerWeek ?? 1;
    if (state.getOnCallCountThisWeek(staffInfo.id, shiftInfo.date) >= maxPerWeek) return false;

    const dayOfWeek = new Date(shiftInfo.date).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const maxWeekendsPerMonth = context.unitConfig?.maxOnCallWeekendsPerMonth ?? 1;
      if (state.getOnCallWeekendsThisMonth(staffInfo.id, shiftInfo.date) >= maxWeekendsPerMonth)
        return false;
    }
  }

  return true;
}

/**
 * Returns human-readable reasons why `staffInfo` cannot be assigned to `shiftInfo`.
 * Used for understaffed-shift reporting.
 */
export function getRejectionReasons(
  staffInfo: StaffInfo,
  shiftInfo: ShiftInfo,
  state: SchedulerState,
  context: SchedulerContext
): string[] {
  const reasons: string[] = [];
  const newStart = toDateTime(shiftInfo.date, shiftInfo.startTime);
  const newEnd = shiftEndDateTime(shiftInfo.date, shiftInfo.startTime, shiftInfo.durationHours);

  const onLeave = context.staffLeaves.some(
    (l) =>
      l.staffId === staffInfo.id &&
      l.status === "approved" &&
      l.startDate <= shiftInfo.date &&
      l.endDate >= shiftInfo.date
  );
  if (onLeave) reasons.push("on approved leave");

  if (staffInfo.employmentType === "per_diem") {
    const avail = context.prnAvailability.find((a) => a.staffId === staffInfo.id);
    if (!avail || !avail.availableDates.includes(shiftInfo.date))
      reasons.push("PRN not available this date");
  }

  if (isICUUnit(shiftInfo.unit) && staffInfo.icuCompetencyLevel < 2)
    reasons.push("competency level too low for ICU/ER");

  if (staffInfo.icuCompetencyLevel === 1) {
    const hasLevel5 = state
      .getShiftAssignments(shiftInfo.id)
      .some((a) => (context.staffMap.get(a.staffId)?.icuCompetencyLevel ?? 0) === 5);
    if (!hasLevel5) reasons.push("Level 1 novice needs a Level 5 preceptor on the shift first");
  }

  if (isICUUnit(shiftInfo.unit) && staffInfo.icuCompetencyLevel === 2) {
    const hasLevel4Plus = state
      .getShiftAssignments(shiftInfo.id)
      .some((a) => (context.staffMap.get(a.staffId)?.icuCompetencyLevel ?? 0) >= 4);
    if (!hasLevel4Plus) reasons.push("Level 2 on ICU/ER needs a Level 4+ supervisor on the shift first");
  }

  if (state.hasOverlapWith(staffInfo.id, newStart, newEnd))
    reasons.push("overlapping shift already assigned");

  const lastEnd = state.getLastShiftEndBefore(staffInfo.id, newStart);
  if (lastEnd) {
    const restHours = (newStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
    if (restHours < 10)
      reasons.push(`insufficient rest (${restHours.toFixed(1)}h, need 10h)`);
  }

  const nextStart = state.getNextShiftStartAfter(staffInfo.id, newEnd);
  if (nextStart) {
    const restHoursAfter = (nextStart.getTime() - newEnd.getTime()) / (1000 * 60 * 60);
    if (restHoursAfter < 10)
      reasons.push(`next shift starts too soon after this one (${restHoursAfter.toFixed(1)}h gap, need 10h)`);
  }

  const maxConsec = Math.min(staffInfo.preferences?.maxConsecutiveDays ?? 5, 5);
  if (state.wouldExceedConsecutiveDays(staffInfo.id, shiftInfo.date, maxConsec))
    reasons.push(`would exceed ${maxConsec} consecutive days`);

  if (state.wouldExceed7DayHours(staffInfo.id, shiftInfo.date, shiftInfo.durationHours, 60)) {
    const peak = state.getPeak7DayHours(staffInfo.id, shiftInfo.date);
    reasons.push(`would exceed 60h in 7 days (peak window currently ${peak}h)`);
  }

  if (shiftInfo.shiftType === "on_call") {
    const maxPerWeek = context.unitConfig?.maxOnCallPerWeek ?? 1;
    if (state.getOnCallCountThisWeek(staffInfo.id, shiftInfo.date) >= maxPerWeek)
      reasons.push("on-call weekly limit reached");
  }

  return reasons;
}
