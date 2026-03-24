import type { StaffInfo, ShiftInfo, UnitConfig } from "@/lib/engine/rules/types";
import type { AssignmentDraft, WeightProfile } from "./types";
import { SchedulerState } from "./state";
import { isICUUnit } from "./eligibility";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Computes the soft-rule penalty score for assigning `staffInfo` to `shiftInfo`
 * given the current scheduler state.
 *
 * Lower score = better candidate.
 * Negative values are valid and used to incentivize needed assignments
 * (e.g., weekends for staff below their minimum).
 */
export function softPenalty(
  staffInfo: StaffInfo,
  shiftInfo: ShiftInfo,
  state: SchedulerState,
  weights: WeightProfile,
  currentShiftAssignments: AssignmentDraft[],
  staffMap: Map<string, StaffInfo>,
  isChargeCandidate: boolean,
  unitConfig: UnitConfig | null,
  historicalWeekendCounts: Map<string, number> = new Map(),
  publicHolidays: string[] = [],
  precomputedHolidayAvg?: number
): number {
  let penalty = 0;

  // ── 1. Overtime ─────────────────────────────────────────────────────────────
  // Exclude this shift's own hours from the weekly total so that re-scoring
  // an existing assignment (already in state) does not double-count its
  // duration. In the greedy phase the candidate is not yet in state, so
  // excluding shiftInfo.id that isn't there has no effect — behaviour unchanged.
  const weekHours = state.getWeeklyHoursExcluding(staffInfo.id, shiftInfo.date, shiftInfo.id);
  const fteTargetHours = (staffInfo.preferences?.maxHoursPerWeek ?? 40) * staffInfo.fte;
  const newTotal = weekHours + shiftInfo.durationHours;

  if (newTotal > 40) {
    // Hours above 40 = overtime (high penalty)
    const otHours = newTotal - Math.max(40, weekHours);
    penalty += weights.overtime * (otHours / 12); // normalise per 12-h shift
  } else if (newTotal > fteTargetHours && fteTargetHours < 40) {
    // Hours above FTE target but still ≤40 = extra (low penalty)
    const extraHours = newTotal - Math.max(fteTargetHours, weekHours);
    if (extraHours > 0) penalty += weights.overtime * 0.3 * (extraHours / 12);
  }

  // Capacity-spreading bonus: give a small incentive to prefer staff who have more
  // remaining hours before hitting the 40h OT threshold. Acts as a tiebreaker that
  // mirrors real charge-nurse behaviour ("ask whoever has worked the least this week").
  // Float pool staff — typically earlier in their week when critical ICU shifts are
  // scheduled first — naturally benefit most, which prevents temporal depletion of
  // their capacity and reduces overtime on regular unit staff later in the schedule.
  // Coefficient (0.1) is intentionally small: it breaks ties without overriding
  // meaningful clinical penalties (skill mix, charge requirement, preferences).
  const remainingBeforeOT = Math.max(0, 40 - weekHours);
  penalty -= weights.overtime * 0.1 * (remainingBeforeOT / 40);

  // ── 2. Preference mismatch ──────────────────────────────────────────────────
  if (staffInfo.preferences) {
    const { preferredShift, preferredDaysOff, avoidWeekends } = staffInfo.preferences;

    if (preferredShift && preferredShift !== "any" && preferredShift !== shiftInfo.shiftType) {
      penalty += weights.preference * 0.5;
    }

    const dayName = DAY_NAMES[new Date(shiftInfo.date).getDay()];
    if (preferredDaysOff.includes(dayName)) {
      penalty += weights.preference * 0.7;
    }

    if (avoidWeekends) {
      const d = new Date(shiftInfo.date).getDay();
      if (d === 0 || d === 6) penalty += weights.preference * 0.6;
    }
  }

  // ── 3. Weekend count equity ──────────────────────────────────────────────────
  // Incentivise staff who haven't reached their required weekend count (bonus).
  // Penalise assigning MORE weekends to staff who already met or exceeded quota so
  // that the Fair variant actually produces lower weekend variance than Balanced/Cost.
  //
  // historicalWeekendCounts seeds the count with weekends worked in the prior
  // schedule period so the same nurses don't always land on weekends every run.
  // A nurse who hit their quota last period starts this period already "at quota"
  // and is penalised for more weekends, while a nurse who was light last period
  // starts below quota and gets the assignment bonus.
  const dayOfWeek = new Date(shiftInfo.date).getDay();
  const isWeekendShift = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekendShift && !staffInfo.weekendExempt) {
    const historicalWeekends = historicalWeekendCounts.get(staffInfo.id) ?? 0;
    const weekendCount = historicalWeekends + state.getWeekendCount(staffInfo.id);
    const required = unitConfig?.weekendShiftsRequired ?? 3;
    if (weekendCount < required) {
      // Below quota: give a bonus so the algorithm fills required weekends first
      penalty -= weights.weekendCount * 0.5;
    } else {
      // At or above quota: penalise; penalty grows with how far over they already are
      const excess = weekendCount - required;
      penalty += weights.weekendCount * (0.4 + excess * 0.3);
    }
  }

  // ── 3b. Consecutive weekend penalty ─────────────────────────────────────────
  // Penalise assigning a weekend shift that would push this staff member's
  // consecutive-weekend streak past the unit maximum (default 2).
  //
  // The quota gate (weekendCount >= required) was removed in v1.7.5. With the
  // FAIR weight now at 15.0, the streak-3 penalty (15 × 1.0 = 15 pts) far
  // outweighs the quota-fill bonus from Section 3 (−1.5 pts), so the penalty
  // wins decisively. Keeping the gate silenced this weight during the greedy
  // phase — streaks of 4–5 consecutive weekends formed before quota was ever
  // reached, and the local search had no signal to repair them. Removing the
  // gate lets the penalty fire from the very first consecutive-weekend violation
  // regardless of quota status.
  //
  // For BALANCED (weight=1.0) the net effect at streak=3 is +0.5 (1.0 penalty
  // − 0.5 quota bonus), a mild deterrence that does not break quota filling.
  //
  // Implementation: O(maxConsecutive) bounded backward/forward date checks
  // using hasWorkedDate() (O(1) Set lookup) — avoids the O(n) full-assignment
  // scan that caused the 14.7× regression on 28-day schedules.
  if (isWeekendShift && !staffInfo.weekendExempt) {
    const maxConsecutive = unitConfig?.maxConsecutiveWeekends ?? 2;

    // Compute the Saturday of the proposed shift
    const newSatObj = new Date(shiftInfo.date);
    if (newSatObj.getDay() === 0) newSatObj.setDate(newSatObj.getDate() - 1);
    const newSatStr = newSatObj.toISOString().slice(0, 10);

    // Compute Sunday of proposed weekend
    const newSunObj = new Date(newSatObj);
    newSunObj.setDate(newSunObj.getDate() + 1);
    const newSunStr = newSunObj.toISOString().slice(0, 10);

    // Skip if staff already works this same weekend (Sat or Sun already assigned)
    const alreadyThisWeekend =
      state.hasWorkedDate(staffInfo.id, newSatStr) ||
      state.hasWorkedDate(staffInfo.id, newSunStr);

    if (!alreadyThisWeekend) {
      // Streak look-back/forward bound: use schedule period length, not maxConsecutive.
      // maxConsecutive = the LIMIT (e.g. 2); streakLookBound = how far to scan.
      // The old bound (maxConsecutive=2) meant streak=4 and streak=5 both appeared
      // as streak=3 — underestimating the penalty by 33–50%.
      const streakLookBound = unitConfig?.schedulePeriodWeeks ?? 6;

      // Count consecutive weekends backward
      let back = 0;
      for (let i = 1; i <= streakLookBound; i++) {
        const prevSat = new Date(newSatObj);
        prevSat.setDate(prevSat.getDate() - 7 * i);
        const prevSatStr = prevSat.toISOString().slice(0, 10);
        const prevSun = new Date(prevSat);
        prevSun.setDate(prevSun.getDate() + 1);
        const prevSunStr = prevSun.toISOString().slice(0, 10);
        if (state.hasWorkedDate(staffInfo.id, prevSatStr) || state.hasWorkedDate(staffInfo.id, prevSunStr)) {
          back++;
        } else {
          break;
        }
      }

      // Count consecutive weekends forward
      let fwd = 0;
      for (let i = 1; i <= streakLookBound; i++) {
        const nextSat = new Date(newSatObj);
        nextSat.setDate(nextSat.getDate() + 7 * i);
        const nextSatStr = nextSat.toISOString().slice(0, 10);
        const nextSun = new Date(nextSat);
        nextSun.setDate(nextSun.getDate() + 1);
        const nextSunStr = nextSun.toISOString().slice(0, 10);
        if (state.hasWorkedDate(staffInfo.id, nextSatStr) || state.hasWorkedDate(staffInfo.id, nextSunStr)) {
          fwd++;
        } else {
          break;
        }
      }

      const streak = 1 + back + fwd;
      if (streak > maxConsecutive) {
        const excess = streak - maxConsecutive;
        penalty += weights.consecutiveWeekends * (0.5 + excess * 0.5);
      }
    }
  }

  // ── 4. Float penalty ────────────────────────────────────────────────────────
  if (staffInfo.homeUnit && staffInfo.homeUnit !== shiftInfo.unit) {
    const isCrossTrained = (staffInfo.crossTrainedUnits ?? []).includes(shiftInfo.unit);
    penalty += weights.float * (isCrossTrained ? 0.3 : 1.0);
  }

  // ── 5. Skill mix ────────────────────────────────────────────────────────────
  const existingLevels = currentShiftAssignments
    .map((a) => staffMap.get(a.staffId)?.icuCompetencyLevel ?? 0)
    .filter((l) => l > 0);

  if (existingLevels.length > 0) {
    const alreadyHasLevel = existingLevels.includes(staffInfo.icuCompetencyLevel);
    if (alreadyHasLevel) {
      const allSame = existingLevels.every((l) => l === staffInfo.icuCompetencyLevel);
      if (allSame) penalty += weights.skillMix * 0.6;
      else penalty += weights.skillMix * 0.1; // slight penalty for any duplicate
    }
    // else: adding a new competency level to the mix → no penalty
  }

  // ── 6. Competency pairing incentives ────────────────────────────────────────
  // Incentivise assigning a Level 5 when a Level 1 is already on the shift
  const hasLevel1 = currentShiftAssignments.some(
    (a) => staffMap.get(a.staffId)?.icuCompetencyLevel === 1
  );
  if (hasLevel1 && staffInfo.icuCompetencyLevel === 5) {
    penalty -= weights.skillMix * 0.8; // strongly incentivise preceptor
  }

  // Incentivise Level 4+ when a Level 2 is already on an ICU/ER shift
  const hasLevel2OnICU = isICUUnit(shiftInfo.unit) &&
    currentShiftAssignments.some((a) => staffMap.get(a.staffId)?.icuCompetencyLevel === 2);
  if (hasLevel2OnICU && staffInfo.icuCompetencyLevel >= 4) {
    penalty -= weights.skillMix * 0.6;
  }

  // ── 7. Charge clustering ────────────────────────────────────────────────────
  // Penalise clustering multiple charge-qualified nurses on the same shift.
  // Each shift needs exactly one charge nurse; having 2+ charge-qualified staff
  // on the same shift wastes scarce leadership capacity that other understaffed
  // shifts may need. Count ALL charge-qualified nurses (designated or regular
  // slot) so that partial clustering (charge slot filled + CQ nurse in regular
  // slot) is also detected and discouraged.
  //
  // The !isChargeCandidate guard is preserved: when filling the charge slot
  // itself (hard requirement), no penalty is applied so the greedy pass is
  // never blocked from satisfying the charge requirement.
  if (!isChargeCandidate && staffInfo.isChargeNurseQualified) {
    const existingChargeQualifiedCount = currentShiftAssignments.filter(
      (a) => staffMap.get(a.staffId)?.isChargeNurseQualified
    ).length;
    if (existingChargeQualifiedCount >= 1) {
      // Scale: 1 already present → +0.8×weight, 2 present → +1.3×weight, etc.
      const excess = existingChargeQualifiedCount;
      penalty += weights.chargeClustering * (0.8 + (excess - 1) * 0.5);
    }
  }

  // ── 8. Agency penalty ───────────────────────────────────────────────────────
  // Agency nurses cost 2–3× the base hourly rate (agency markup + premium pay).
  // Apply a flat penalty so the scheduler treats them as last resort — used only
  // when the regular, float, and PRN pools cannot fill the slot.
  if (staffInfo.employmentType === "agency") {
    penalty += weights.agency * 1.0;
  }

  // ── 9. Holiday fairness ──────────────────────────────────────────────────────
  // Penalise assigning a holiday shift to a nurse who already has more holidays
  // than average. This steers the scheduler toward nurses who have worked fewer
  // holidays so far in the current schedule — crucial for the FAIR variant
  // (holidayFairness weight 3.0) and mild for BALANCED (1.0).
  //
  // Only fires when the shift date is a public holiday and publicHolidays is
  // provided. Penalty is proportional to how far above the current average the
  // nurse already is (excess measured in whole holidays).
  if (publicHolidays.length > 0 && publicHolidays.includes(shiftInfo.date)) {
    // Count holidays this nurse has been assigned so far this schedule
    let nurseholidayCount = 0;
    for (const a of state.getStaffAssignments(staffInfo.id)) {
      if (publicHolidays.includes(a.date)) nurseholidayCount++;
    }

    // Average holiday assignments across all staff.
    // When a precomputed value is provided by the caller (computed once per
    // local-search iteration), use it directly — avoids O(staff × assignments)
    // per softPenalty call. Staleness is negligible: the average changes by
    // at most 1/staffCount per swap, which is < 0.03 for a 33-person team.
    let avgHolidays: number;
    if (precomputedHolidayAvg !== undefined) {
      avgHolidays = precomputedHolidayAvg;
    } else {
      let totalHolidayAssignments = 0;
      let staffWithAny = 0;
      for (const [sid] of staffMap) {
        let count = 0;
        for (const a of state.getStaffAssignments(sid)) {
          if (publicHolidays.includes(a.date)) count++;
        }
        totalHolidayAssignments += count;
        staffWithAny++;
      }
      avgHolidays = staffWithAny > 0 ? totalHolidayAssignments / staffWithAny : 0;
    }
    const holidayExcess = nurseholidayCount - avgHolidays;
    if (holidayExcess > 0.5) {
      // Penalise each holiday above average; scale with the profile's holidayFairness weight
      penalty += weights.holidayFairness * 0.5 * holidayExcess;
    }
  }

  // ── 10. Per-nurse load fairness ──────────────────────────────────────────────
  // Penalise assigning to nurses who already have significantly more total
  // assignments than their peers. Spreads shift count across the team so that
  // a single high-competency nurse does not accumulate disproportionate shifts.
  //
  // Only active when the profile emphasises fairness (weekendCount weight > 1.0,
  // i.e. FAIR variant). BALANCED and COST get a near-zero penalty here.
  if (weights.weekendCount > 1.0) {
    const totalAssigned = state.getAssignmentCount(staffInfo.id);
    const totalCount = state.totalAssignmentCount();
    const staffCount = staffMap.size;
    const averageAssigned = staffCount > 0 ? totalCount / staffCount : 0;
    const loadExcess = totalAssigned - averageAssigned;
    if (loadExcess > 1) {
      penalty += weights.weekendCount * 0.2 * loadExcess;
    }
  }

  return penalty;
}
