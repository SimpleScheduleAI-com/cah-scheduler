import { describe, it, expect } from "vitest";
import { icuCompetencyRule } from "@/lib/engine/rules/icu-competency";
import { makeContext, makeAssignment, makeStaff, makeShift } from "../helpers/context";

// The rule only fires for ICU/ER shifts — all tests use an ICU shift in shiftMap.
const icuShift = makeShift({ id: "shift-1", unit: "ICU" });
const icuShiftMap = new Map([["shift-1", icuShift]]);

describe("icu-competency rule", () => {
  it("passes when all staff meet minimum competency level (default 2)", () => {
    const s1 = makeStaff({ id: "staff-1", icuCompetencyLevel: 2 });
    const s2 = makeStaff({ id: "staff-2", icuCompetencyLevel: 5 });
    const a1 = makeAssignment({ id: "a1", staffId: "staff-1" });
    const a2 = makeAssignment({ id: "a2", staffId: "staff-2" });
    const ctx = makeContext({
      assignments: [a1, a2],
      staffMap: new Map([["staff-1", s1], ["staff-2", s2]]),
      shiftMap: icuShiftMap,
    });
    expect(icuCompetencyRule.evaluate(ctx)).toHaveLength(0);
  });

  it("flags staff below minimum competency level", () => {
    const staff = makeStaff({ id: "staff-1", icuCompetencyLevel: 1 });
    const a1 = makeAssignment({ id: "a1", staffId: "staff-1" });
    const ctx = makeContext({
      assignments: [a1],
      staffMap: new Map([["staff-1", staff]]),
      shiftMap: icuShiftMap,
    });
    const violations = icuCompetencyRule.evaluate(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("icu-competency");
    expect(violations[0].staffId).toBe("staff-1");
    expect(violations[0].description).toContain("require Level 2 or above");
  });

  it("flags multiple staff below minimum", () => {
    const s1 = makeStaff({ id: "staff-1", icuCompetencyLevel: 1 });
    const s2 = makeStaff({ id: "staff-2", icuCompetencyLevel: 1 });
    const s3 = makeStaff({ id: "staff-3", icuCompetencyLevel: 3 });
    const a1 = makeAssignment({ id: "a1", staffId: "staff-1" });
    const a2 = makeAssignment({ id: "a2", staffId: "staff-2" });
    const a3 = makeAssignment({ id: "a3", staffId: "staff-3" });
    const ctx = makeContext({
      assignments: [a1, a2, a3],
      staffMap: new Map([["staff-1", s1], ["staff-2", s2], ["staff-3", s3]]),
      shiftMap: icuShiftMap,
    });
    const violations = icuCompetencyRule.evaluate(ctx);
    expect(violations).toHaveLength(2);
  });

  it("respects custom minLevel parameter", () => {
    const staff = makeStaff({ id: "staff-1", icuCompetencyLevel: 3 });
    const a1 = makeAssignment({ id: "a1", staffId: "staff-1" });
    const ctx = makeContext({
      assignments: [a1],
      staffMap: new Map([["staff-1", staff]]),
      shiftMap: icuShiftMap,
      ruleParameters: { minLevel: 4 },
    });
    const violations = icuCompetencyRule.evaluate(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("require Level 4 or above");
  });

  it("passes with competency level exactly at custom minimum", () => {
    const staff = makeStaff({ id: "staff-1", icuCompetencyLevel: 3 });
    const a1 = makeAssignment({ id: "a1", staffId: "staff-1" });
    const ctx = makeContext({
      assignments: [a1],
      staffMap: new Map([["staff-1", staff]]),
      shiftMap: icuShiftMap,
      ruleParameters: { minLevel: 3 },
    });
    expect(icuCompetencyRule.evaluate(ctx)).toHaveLength(0);
  });

  it("does not fire for non-ICU/ER shifts", () => {
    const staff = makeStaff({ id: "staff-1", icuCompetencyLevel: 1 });
    const a1 = makeAssignment({ id: "a1", staffId: "staff-1" });
    const medSurgShift = makeShift({ id: "shift-1", unit: "Med-Surg" });
    const ctx = makeContext({
      assignments: [a1],
      staffMap: new Map([["staff-1", staff]]),
      shiftMap: new Map([["shift-1", medSurgShift]]),
    });
    expect(icuCompetencyRule.evaluate(ctx)).toHaveLength(0);
  });
});
