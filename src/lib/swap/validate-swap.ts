/**
 * Pure validation logic for shift swap requests.
 * No DB calls — the API route fetches all data and passes it in.
 * Tested independently in src/__tests__/swap/validate-swap.test.ts.
 */

import { addDays } from "@/lib/engine/scheduler/state";

export interface SwapStaffInfo {
  id: string;
  name: string;
  role: string;
  icuCompetencyLevel: number;
  isChargeNurseQualified: boolean;
}

export interface SwapShiftInfo {
  /** Shift date (YYYY-MM-DD) */
  date: string;
  startTime: string;
  endTime: string;
  /** True when this particular assignment slot carries the charge nurse responsibility */
  isChargeNurse: boolean;
  unit: string;
}

export interface SwapSideParams {
  staff: SwapStaffInfo;
  /** The shift this staff member would take after the swap */
  takesShift: SwapShiftInfo;
  /**
   * Other staff already assigned to takesShift (excluding the person who is leaving it).
   * Used for Level 2 supervision check.
   */
  coworkersOnTakesShift: Array<{ icuCompetencyLevel: number }>;
  /**
   * Staff member's other assignments on takesShift.date (excluding their current position).
   * Used to detect same-date overlaps.
   */
  otherAssignmentsOnDate: Array<{ startTime: string; endTime: string }>;
  /**
   * Staff member's assignments on the day before (D-1) and day after (D+1) takesShift.date,
   * excluding their current assignment that is being swapped out.
   * Used for the ≥10h rest-between-shifts check.
   */
  adjacentAssignments: Array<{ date: string; startTime: string; endTime: string }>;
  /** True when staff has an approved leave record covering takesShift.date */
  hasApprovedLeave: boolean;
  /**
   * Staff member's assignments within ±6 days of takesShift.date, EXCLUDING
   * the assignment being given up in the swap. Drives the 60h rolling-window
   * and max-consecutive-days hard checks. When omitted, those checks are
   * skipped (legacy callers).
   */
  windowAssignments?: Array<{ date: string; durationHours: number }>;
  /** Duration of takesShift in hours — required for the 60h check. */
  takesShiftDurationHours?: number;
  /** Maximum consecutive working days (defaults to 5). */
  maxConsecutiveDays?: number;
}

export interface SwapViolation {
  staffId: string;
  staffName: string;
  ruleId: string;
  severity: "hard";
  description: string;
}

function timesToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

/** Returns true if two time-ranges on the same calendar date overlap (handles overnight shifts). */
export function shiftsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const sA = timesToMins(startA);
  const eA = timesToMins(endA);
  const sB = timesToMins(startB);
  const eB = timesToMins(endB);
  // Overnight: endTime < startTime — treat end as +24h
  const endANorm = eA > sA ? eA : eA + 24 * 60;
  const endBNorm = eB > sB ? eB : eB + 24 * 60;
  return sA < endBNorm && endANorm > sB;
}

/**
 * Compute the rest gap in minutes between two consecutive assignments.
 * @param prevEnd   endTime of the earlier assignment (HH:MM)
 * @param prevIsOvernight true when prevShift crosses midnight (endTime ≤ startTime of that shift)
 * @param nextStart startTime of the later assignment (HH:MM)
 */
export function computeRestGapMins(
  prevEnd: string,
  prevIsOvernight: boolean,
  nextStart: string
): number {
  const prevEndMins = timesToMins(prevEnd);
  const nextStartMins = timesToMins(nextStart);
  // Overnight D-1 shift ends early morning on D — gap is simply nextStart - prevEnd
  if (prevIsOvernight) return nextStartMins - prevEndMins;
  // Normal D-1 shift ends on D-1 — gap spans midnight
  return 24 * 60 - prevEndMins + nextStartMins;
}

/** Validate one side of a proposed swap. Returns hard violations only. */
export function validateSwapSide(side: SwapSideParams): SwapViolation[] {
  const violations: SwapViolation[] = [];
  const {
    staff,
    takesShift,
    coworkersOnTakesShift,
    otherAssignmentsOnDate,
    adjacentAssignments,
    hasApprovedLeave,
  } = side;

  // 1. Approved leave conflict
  if (hasApprovedLeave) {
    violations.push({
      staffId: staff.id,
      staffName: staff.name,
      ruleId: "leave-conflict",
      severity: "hard",
      description: `${staff.name} has approved leave on ${takesShift.date} and cannot be assigned this shift.`,
    });
  }

  // 2. ICU competency level ≥ 2
  if (staff.icuCompetencyLevel < 2) {
    violations.push({
      staffId: staff.id,
      staffName: staff.name,
      ruleId: "icu-competency",
      severity: "hard",
      description: `${staff.name} is Level ${staff.icuCompetencyLevel} — minimum required for ${takesShift.unit} shifts is Level 2.`,
    });
  }

  // 3. Charge nurse qualification: assignment carries charge role → need Level 4+
  if (takesShift.isChargeNurse && staff.icuCompetencyLevel < 4) {
    violations.push({
      staffId: staff.id,
      staffName: staff.name,
      ruleId: "charge-nurse",
      severity: "hard",
      description: `${staff.name} is Level ${staff.icuCompetencyLevel} — the charge nurse role requires Level 4 or above.`,
    });
  }

  // 4. Level 2 supervision: Level 2 staff in ICU/ER needs a Level 4+ coworker on the same shift
  if (staff.icuCompetencyLevel === 2) {
    const hasLevel4Coworker = coworkersOnTakesShift.some((c) => c.icuCompetencyLevel >= 4);
    if (!hasLevel4Coworker) {
      violations.push({
        staffId: staff.id,
        staffName: staff.name,
        ruleId: "competency-pairing",
        severity: "hard",
        description: `${staff.name} is Level 2 and requires a Level 4+ supervisor on the same shift. No Level 4+ staff will remain on this shift after the swap.`,
      });
    }
  }

  // 5. Same-date shift overlap
  for (const other of otherAssignmentsOnDate) {
    if (shiftsOverlap(takesShift.startTime, takesShift.endTime, other.startTime, other.endTime)) {
      violations.push({
        staffId: staff.id,
        staffName: staff.name,
        ruleId: "no-overlapping-shifts",
        severity: "hard",
        description: `${staff.name} already has a shift on ${takesShift.date} that overlaps with ${takesShift.startTime}–${takesShift.endTime}.`,
      });
      break;
    }
  }

  // 6. Rest hours (≥10h) — check D-1 and D+1 adjacent assignments
  const newShiftIsOvernight =
    timesToMins(takesShift.endTime) <= timesToMins(takesShift.startTime);

  for (const adj of adjacentAssignments) {
    const isPrev = adj.date < takesShift.date; // D-1
    const isNext = adj.date > takesShift.date; // D+1

    if (isPrev) {
      // Gap: from adj.endTime → takesShift.startTime
      const adjIsOvernight = timesToMins(adj.endTime) <= timesToMins(adj.startTime);
      const gapMins = computeRestGapMins(adj.endTime, adjIsOvernight, takesShift.startTime);
      if (gapMins < 10 * 60) {
        violations.push({
          staffId: staff.id,
          staffName: staff.name,
          ruleId: "rest-hours",
          severity: "hard",
          description: `${staff.name} would have only ${Math.round(gapMins / 60)}h rest before this shift (minimum 10h required). They finish a shift at ${adj.endTime} on ${adj.date}.`,
        });
      }
    }

    if (isNext) {
      // Gap: from takesShift.endTime → adj.startTime
      const gapMins = computeRestGapMins(takesShift.endTime, newShiftIsOvernight, adj.startTime);
      if (gapMins < 10 * 60) {
        violations.push({
          staffId: staff.id,
          staffName: staff.name,
          ruleId: "rest-hours",
          severity: "hard",
          description: `${staff.name} would have only ${Math.round(gapMins / 60)}h rest after this shift before their next shift at ${adj.startTime} on ${adj.date} (minimum 10h required).`,
        });
      }
    }
  }

  // 7. Max 60 hours in any rolling 7-day window containing takesShift.date.
  //    Mirrors SchedulerState.wouldExceed7DayHours — all 7 windows are checked,
  //    not just the backward one, so already-scheduled future shifts count.
  const windowAssignments = side.windowAssignments;
  const newDuration = side.takesShiftDurationHours;
  if (windowAssignments && newDuration !== undefined) {
    for (let offset = 0; offset <= 6; offset++) {
      const windowStart = addDays(takesShift.date, -offset);
      const windowEnd = addDays(windowStart, 6);
      const existing = windowAssignments
        .filter((a) => a.date >= windowStart && a.date <= windowEnd)
        .reduce((sum, a) => sum + a.durationHours, 0);
      if (existing + newDuration > 60) {
        violations.push({
          staffId: staff.id,
          staffName: staff.name,
          ruleId: "max-hours-60",
          severity: "hard",
          description: `${staff.name} would work ${existing + newDuration}h in the 7 days starting ${windowStart} (maximum 60h).`,
        });
        break;
      }
    }
  }

  // 8. Max consecutive working days. Counts the runs adjacent to the taken
  //    shift's date, including runs the new shift would bridge together.
  if (windowAssignments) {
    const maxConsecutive = side.maxConsecutiveDays ?? 5;
    const workedDates = new Set(windowAssignments.map((a) => a.date));
    let count = 1; // the taken shift's day itself
    for (let i = 1; i <= maxConsecutive; i++) {
      if (workedDates.has(addDays(takesShift.date, -i))) count++;
      else break;
    }
    for (let i = 1; i <= maxConsecutive; i++) {
      if (workedDates.has(addDays(takesShift.date, i))) count++;
      else break;
    }
    if (count > maxConsecutive) {
      violations.push({
        staffId: staff.id,
        staffName: staff.name,
        ruleId: "max-consecutive",
        severity: "hard",
        description: `${staff.name} would work ${count} consecutive days (maximum ${maxConsecutive}).`,
      });
    }
  }

  return violations;
}

/** Validate both sides of a proposed swap. Returns all hard violations found. */
export function validateSwap(
  requestingSide: SwapSideParams,
  targetSide: SwapSideParams
): SwapViolation[] {
  return [...validateSwapSide(requestingSide), ...validateSwapSide(targetSide)];
}
