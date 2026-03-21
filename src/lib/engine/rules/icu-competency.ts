import type { RuleEvaluator, RuleContext, RuleViolation } from "./types";

export const icuCompetencyRule: RuleEvaluator = {
  id: "icu-competency",
  name: "ICU/ER Competency Requirement",
  type: "hard",
  category: "skill",
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const minLevel = (context.ruleParameters.minLevel as number) ?? 2;

    for (const a of context.assignments) {
      const staff = context.staffMap.get(a.staffId);
      if (!staff) continue;

      // This rule only applies to ICU and ER shifts.
      // Level 1 orientees may work other units (e.g. Med-Surg) with a Level 5 preceptor
      // — that is governed by the level1-preceptor rule, not this one.
      const shift = context.shiftMap.get(a.shiftId);
      if (!shift) continue;
      const unit = shift.unit?.toUpperCase() ?? "";
      if (unit !== "ICU" && unit !== "ER") continue;

      if (staff.icuCompetencyLevel < minLevel) {
        violations.push({
          ruleId: "icu-competency",
          ruleName: "ICU/ER Competency Requirement",
          ruleType: "hard",
          shiftId: a.shiftId,
          staffId: a.staffId,
          description: `${staff.firstName} ${staff.lastName} is Level ${staff.icuCompetencyLevel} — ICU/ER shifts require Level ${minLevel} or above.`,
        });
      }
    }

    return violations;
  },
};
