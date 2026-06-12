import type { RuleEvaluator, RuleContext, RuleViolation } from "./types";
import { utcDayOfWeek } from "@/lib/engine/scheduler/state";

/**
 * Weekend Exempt Rule (Soft)
 *
 * weekendExempt staff are exempt from the weekend quota AND should not be
 * scheduled on weekends unless there is no better option. Product decision
 * (Jun 2026): this stays a SOFT violation — the generator treats exempt
 * staff as a last resort for weekend slots (see scoring.ts), and any weekend
 * assignment that does happen is surfaced in the violations panel so the
 * manager can judge whether it was justified. May be promoted to a hard rule
 * later if customer contracts require an outright ban.
 */
export const weekendExemptRule: RuleEvaluator = {
  id: "weekend-exempt",
  name: "Weekend-Exempt Staff Scheduled on Weekend",
  type: "soft",
  category: "preference",
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];

    for (const a of context.assignments) {
      const staff = context.staffMap.get(a.staffId);
      if (!staff?.weekendExempt) continue;

      const day = utcDayOfWeek(a.date);
      if (day !== 0 && day !== 6) continue;

      violations.push({
        ruleId: "weekend-exempt",
        ruleName: "Weekend-Exempt Staff Scheduled on Weekend",
        ruleType: "soft",
        shiftId: a.shiftId,
        staffId: a.staffId,
        description: `${staff.firstName} ${staff.lastName} is weekend-exempt but scheduled on ${a.date} (${day === 6 ? "Saturday" : "Sunday"})`,
        penaltyScore: 1.0,
      });
    }

    return violations;
  },
};
