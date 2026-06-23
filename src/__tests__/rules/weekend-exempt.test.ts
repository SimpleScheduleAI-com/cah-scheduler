/**
 * Tests for the weekend-exempt soft rule.
 *
 * Product decision (Jun 2026): weekendExempt staff CAN be scheduled on
 * weekends (it stays a quota exemption, not a hard ban), but doing so is a
 * SOFT violation — the schedule generator should treat them as a last
 * resort, and managers should see the violation in the panel so they can
 * judge whether it was justified.
 */

import { describe, it, expect } from "vitest";
import { weekendExemptRule } from "@/lib/engine/rules/weekend-exempt";
import { getEvaluator } from "@/lib/engine/rules";
import { makeContext, makeAssignment, makeStaff, makeShift } from "../helpers/context";

describe("weekend-exempt rule", () => {
  const exempt = makeStaff({ id: "staff-1", weekendExempt: true });
  const regular = makeStaff({ id: "staff-2", weekendExempt: false });
  const staffMap = new Map([
    ["staff-1", exempt],
    ["staff-2", regular],
  ]);

  it("is registered in the evaluator registry", () => {
    expect(getEvaluator("weekend-exempt")).toBeDefined();
  });

  it("flags a weekend assignment for a weekend-exempt nurse (soft)", () => {
    const shift = makeShift({ id: "s-sat", date: "2026-03-07" }); // Saturday
    const ctx = makeContext({
      assignments: [makeAssignment({ id: "a1", shiftId: "s-sat", staffId: "staff-1", date: "2026-03-07" })],
      shiftMap: new Map([[shift.id, shift]]),
      staffMap,
    });
    const violations = weekendExemptRule.evaluate(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleType).toBe("soft");
    expect(violations[0].staffId).toBe("staff-1");
    expect(violations[0].shiftId).toBe("s-sat");
    expect(violations[0].penaltyScore).toBeGreaterThan(0);
  });

  it("flags Sunday assignments too", () => {
    const shift = makeShift({ id: "s-sun", date: "2026-03-08" }); // Sunday
    const ctx = makeContext({
      assignments: [makeAssignment({ id: "a1", shiftId: "s-sun", staffId: "staff-1", date: "2026-03-08" })],
      shiftMap: new Map([[shift.id, shift]]),
      staffMap,
    });
    expect(weekendExemptRule.evaluate(ctx)).toHaveLength(1);
  });

  it("does not flag a weekday assignment for an exempt nurse", () => {
    const shift = makeShift({ id: "s-mon", date: "2026-03-09" }); // Monday
    const ctx = makeContext({
      assignments: [makeAssignment({ id: "a1", shiftId: "s-mon", staffId: "staff-1", date: "2026-03-09" })],
      shiftMap: new Map([[shift.id, shift]]),
      staffMap,
    });
    expect(weekendExemptRule.evaluate(ctx)).toHaveLength(0);
  });

  it("does not flag weekend assignments for non-exempt staff", () => {
    const shift = makeShift({ id: "s-sat", date: "2026-03-07" });
    const ctx = makeContext({
      assignments: [makeAssignment({ id: "a1", shiftId: "s-sat", staffId: "staff-2", date: "2026-03-07" })],
      shiftMap: new Map([[shift.id, shift]]),
      staffMap,
    });
    expect(weekendExemptRule.evaluate(ctx)).toHaveLength(0);
  });
});
