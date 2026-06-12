import type { RuleEvaluator, RuleContext, RuleViolation } from "./types";

export const maxConsecutiveRule: RuleEvaluator = {
  id: "max-consecutive",
  name: "Maximum Consecutive Days",
  type: "hard",
  category: "rest",
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const maxDays = (context.ruleParameters.maxConsecutiveDays as number) ?? 5;

    // Group assignments by staff — include the prior period's worked dates so
    // runs spanning the schedule boundary are counted. Violations are only
    // emitted for dates inside the current schedule (see gate below).
    const staffAssignments = new Map<string, Set<string>>();
    for (const a of context.assignments) {
      const dates = staffAssignments.get(a.staffId) ?? new Set();
      dates.add(a.date);
      staffAssignments.set(a.staffId, dates);
    }
    for (const p of context.priorAssignments ?? []) {
      // Prior dates only extend runs for staff with current assignments —
      // purely-prior patterns were the previous schedule's concern.
      const dates = staffAssignments.get(p.staffId);
      if (dates) dates.add(p.date);
    }

    const scheduleStart = context.scheduleStartDate;

    for (const [staffId, dateSet] of staffAssignments) {
      const staff = context.staffMap.get(staffId);
      const dates = [...dateSet].sort();

      let consecutive = 1;
      let streakStart = dates[0];

      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1] + "T00:00:00Z");
        const curr = new Date(dates[i] + "T00:00:00Z");
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

        if (diffDays === 1) {
          consecutive++;
          // Gate: only flag days inside the current schedule period.
          if (consecutive > maxDays && (!scheduleStart || dates[i] >= scheduleStart)) {
            violations.push({
              ruleId: "max-consecutive",
              ruleName: "Maximum Consecutive Days",
              ruleType: "hard",
              shiftId: context.assignments.find(
                (a) => a.staffId === staffId && a.date === dates[i]
              )?.shiftId ?? "",
              staffId,
              description: `${staff?.firstName} ${staff?.lastName} working ${consecutive} consecutive days (${streakStart} to ${dates[i]}), max allowed: ${maxDays}`,
            });
          }
        } else {
          consecutive = 1;
          streakStart = dates[i];
        }
      }
    }

    return violations;
  },
};
