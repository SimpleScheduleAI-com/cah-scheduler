import type { RuleEvaluator, RuleContext, RuleViolation } from "./types";

function parseTime(date: string, time: string): number {
  const [h, m] = time.split(":").map(Number);
  return new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).getTime();
}

export const restHoursRule: RuleEvaluator = {
  id: "rest-hours",
  name: "Minimum Rest Between Shifts",
  type: "hard",
  category: "rest",
  evaluate(context: RuleContext): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const minRestHours = (context.ruleParameters.minRestHours as number) ?? 10;

    // Group assignments by staff. Prior-period assignments (the 7 days before
    // the schedule starts) are merged in as pseudo-entries so the gap between
    // the prior period's last shift and this period's first shift is checked.
    // They are flagged `isPrior` so violations are only attached to current
    // assignments (a `next` that is prior means both shifts predate this
    // schedule — the previous schedule's concern, not ours).
    type Entry = (typeof context.assignments)[number] & { isPrior?: boolean };
    const staffAssignments = new Map<string, Entry[]>();
    for (const a of context.assignments) {
      const list = staffAssignments.get(a.staffId) ?? [];
      list.push(a);
      staffAssignments.set(a.staffId, list);
    }
    for (const p of context.priorAssignments ?? []) {
      const list = staffAssignments.get(p.staffId);
      if (!list) continue; // no current assignments — nothing to protect
      list.push({
        id: `prior-${p.staffId}-${p.date}-${p.startTime}`,
        shiftId: "",
        staffId: p.staffId,
        date: p.date,
        startTime: p.startTime,
        endTime: p.endTime,
        durationHours: p.durationHours,
        shiftType: p.shiftType,
        isPrior: true,
      } as Entry);
    }

    for (const [staffId, assignments] of staffAssignments) {
      if (assignments.length < 2) continue;

      const staff = context.staffMap.get(staffId);
      const sorted = [...assignments].sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.startTime.localeCompare(b.startTime);
      });

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        // Calculate end time of current shift
        let endTime: number;
        if (current.endTime < current.startTime) {
          // Night shift crossing midnight
          const nextDay = new Date(current.date);
          nextDay.setDate(nextDay.getDate() + 1);
          endTime = parseTime(nextDay.toISOString().split("T")[0], current.endTime);
        } else {
          endTime = parseTime(current.date, current.endTime);
        }

        const nextStart = parseTime(next.date, next.startTime);
        const restHours = (nextStart - endTime) / (1000 * 60 * 60);

        if (restHours < minRestHours && restHours >= 0 && !next.isPrior) {
          violations.push({
            ruleId: "rest-hours",
            ruleName: "Minimum Rest Between Shifts",
            ruleType: "hard",
            shiftId: next.shiftId,
            staffId,
            description: `${staff?.firstName} ${staff?.lastName} has only ${restHours.toFixed(1)}h rest between ${current.date} ${current.shiftType} and ${next.date} ${next.shiftType} (min: ${minRestHours}h)`,
          });
        }
      }
    }

    return violations;
  },
};
