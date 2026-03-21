import { describe, it, expect } from "vitest";
import { minStaffRule } from "@/lib/engine/rules/min-staff";
import { makeContext, makeShift, makeAssignment, makeStaff } from "../helpers/context";

describe("min-staff rule", () => {
  it("passes when shift has exactly required staff count", () => {
    const shift = makeShift({ id: "s1", requiredStaffCount: 2 });
    const a1 = makeAssignment({ id: "a1", shiftId: "s1", staffId: "staff-1" });
    const a2 = makeAssignment({ id: "a2", shiftId: "s1", staffId: "staff-2" });
    // unitConfig: null disables the unit-level floor so we test only requiredStaffCount logic
    const ctx = makeContext({
      shiftMap: new Map([["s1", shift]]),
      assignments: [a1, a2],
      unitConfig: null,
    });
    expect(minStaffRule.evaluate(ctx)).toHaveLength(0);
  });

  it("passes when shift has more than required staff", () => {
    const shift = makeShift({ id: "s1", requiredStaffCount: 2 });
    const assignments = ["staff-1", "staff-2", "staff-3"].map((id, i) =>
      makeAssignment({ id: `a${i}`, shiftId: "s1", staffId: id })
    );
    const ctx = makeContext({
      shiftMap: new Map([["s1", shift]]),
      assignments,
    });
    expect(minStaffRule.evaluate(ctx)).toHaveLength(0);
  });

  it("flags shift with too few staff", () => {
    const shift = makeShift({ id: "s1", requiredStaffCount: 3 });
    const a1 = makeAssignment({ id: "a1", shiftId: "s1", staffId: "staff-1" });
    const ctx = makeContext({
      shiftMap: new Map([["s1", shift]]),
      assignments: [a1],
    });
    const violations = minStaffRule.evaluate(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("min-staff");
    expect(violations[0].ruleType).toBe("hard");
    expect(violations[0].shiftId).toBe("s1");
    expect(violations[0].description).toContain("1 staff");
    expect(violations[0].description).toContain("requires 3");
  });

  it("flags completely unstaffed shift", () => {
    const shift = makeShift({ id: "s1", requiredStaffCount: 2 });
    const ctx = makeContext({
      shiftMap: new Map([["s1", shift]]),
      assignments: [],
    });
    const violations = minStaffRule.evaluate(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("0 staff");
  });

  it("uses census band count when census is set and band matches", () => {
    // Band requires 2 RNs + 1 CNA = 3 total, but census data takes precedence
    const shift = makeShift({ id: "s1", requiredStaffCount: 2, actualCensus: 4 });
    const band = { id: "b1", minPatients: 1, maxPatients: 6, requiredRNs: 3, requiredLPNs: 0, requiredCNAs: 1, requiredChargeNurses: 1, patientToNurseRatio: "2:1" };
    // Only 2 staff assigned, but band needs 3+1=4
    const assignments = ["s1", "s2"].map((id, i) =>
      makeAssignment({ id: `a${i}`, shiftId: "s1", staffId: id })
    );
    const ctx = makeContext({
      shiftMap: new Map([["s1", shift]]),
      assignments,
      censusBands: [band],
    });
    const violations = minStaffRule.evaluate(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("requires 4");
  });

  it("uses shift requiredStaffCount when no matching census band", () => {
    const shift = makeShift({ id: "s1", requiredStaffCount: 2, actualCensus: 100 });
    // No matching band for census=100
    const band = { id: "b1", minPatients: 0, maxPatients: 6, requiredRNs: 3, requiredLPNs: 0, requiredCNAs: 0, requiredChargeNurses: 1, patientToNurseRatio: "2:1" };
    const a1 = makeAssignment({ id: "a1", shiftId: "s1", staffId: "staff-1" });
    const a2 = makeAssignment({ id: "a2", shiftId: "s1", staffId: "staff-2" });
    // unitConfig: null disables the unit-level floor so we test only census fallback logic
    const ctx = makeContext({
      shiftMap: new Map([["s1", shift]]),
      assignments: [a1, a2],
      censusBands: [band],
      unitConfig: null,
    });
    // Census 100 doesn't match band (0-6), so falls back to requiredStaffCount=2, which is met
    expect(minStaffRule.evaluate(ctx)).toHaveLength(0);
  });

  it("generates one violation per understaffed shift", () => {
    const s1 = makeShift({ id: "s1", requiredStaffCount: 2 });
    const s2 = makeShift({ id: "s2", requiredStaffCount: 3, date: "2026-02-11" });
    const a1 = makeAssignment({ id: "a1", shiftId: "s1", staffId: "staff-1" });
    const ctx = makeContext({
      shiftMap: new Map([["s1", s1], ["s2", s2]]),
      assignments: [a1],
    });
    const violations = minStaffRule.evaluate(ctx);
    expect(violations).toHaveLength(2); // Both shifts are short
  });
});
