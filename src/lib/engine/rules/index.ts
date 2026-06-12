import type { RuleEvaluator } from "./types";
import { minStaffRule } from "./min-staff";
import { chargeNurseRule } from "./charge-nurse";
import { patientRatioRule } from "./patient-ratio";
import { restHoursRule } from "./rest-hours";
import { maxConsecutiveRule } from "./max-consecutive";
import { icuCompetencyRule } from "./icu-competency";
import { preferenceMatchRule } from "./preference-match";
import { skillMixRule } from "./skill-mix";
// NOTE: overtime-cost and weekend-fairness are superseded (by overtime-v2 and
// weekend-count/consecutive-weekends respectively) and intentionally NOT
// registered — activating them alongside their replacements would
// double-penalize the same hours/weekends with conflicting math.
// New rules
import { level1PreceptorRule, level2SupervisionRule } from "./competency-pairing";
import { noOverlappingShiftsRule } from "./no-overlapping-shifts";
import { prnAvailabilityRule, staffOnLeaveRule } from "./prn-availability";
import { onCallLimitsRule, maxHoursRule } from "./on-call-limits";
import {
  weekendCountRule,
  consecutiveWeekendRule,
  holidayFairnessRule,
} from "./weekend-holiday-fairness";
import { floatPenaltyRule } from "./float-penalty";
import { chargeClusteringRule } from "./charge-clustering";
import { overtimeRulesV2 } from "./overtime-v2";

const evaluatorRegistry: Map<string, RuleEvaluator> = new Map();

// Register all built-in rules
[
  // Original hard rules
  minStaffRule,
  chargeNurseRule,
  patientRatioRule,
  restHoursRule,
  maxConsecutiveRule,
  icuCompetencyRule,
  // New hard rules
  level1PreceptorRule,
  level2SupervisionRule,
  noOverlappingShiftsRule,
  prnAvailabilityRule,
  staffOnLeaveRule,
  onCallLimitsRule,
  maxHoursRule,
  // Original soft rules
  preferenceMatchRule,
  skillMixRule,
  // New soft rules
  weekendCountRule,
  consecutiveWeekendRule,
  holidayFairnessRule,
  floatPenaltyRule,
  chargeClusteringRule,
  overtimeRulesV2,
].forEach((rule) => {
  evaluatorRegistry.set(rule.id, rule);
});

export function getEvaluator(id: string): RuleEvaluator | undefined {
  return evaluatorRegistry.get(id);
}

export function getAllEvaluators(): RuleEvaluator[] {
  return [...evaluatorRegistry.values()];
}

// Re-export types
export type { RuleEvaluator, RuleContext, RuleViolation, EvaluationResult } from "./types";
