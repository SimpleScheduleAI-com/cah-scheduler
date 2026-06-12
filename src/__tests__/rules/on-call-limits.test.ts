import { describe, it, expect } from "vitest";
import { onCallLimitsRule, maxHoursRule } from "@/lib/engine/rules/on-call-limits";
import { makeContext, makeAssignment, makeStaff, makeShift } from "../helpers/context";

describe("on-call-limits rule", () => {
  const staff = makeStaff({ id: "staff-1" });
  const staffMap = new Map([["staff-1", staff]]);

  // Week of 2026-02-09 (Mon) to 2026-02-15 (Sun)
  const makeOnCallAssignment = (date: string, id: string) => {
    const shiftId = `oncall-${date}`;
    return {
      assignment: makeAssignment({ id, shiftId, staffId: "staff-1", date, shiftType: "on_call" }),
      shift: makeShift({ id: shiftId, date, shiftType: "on_call" }),
    };
  };

  it("passes when staff has exactly 1 on-call shift in a week (at limit)", () => {
    const { assignment: a1, shift: s1 } = makeOnCallAssignment("2026-02-10", "a1"); // Tuesday
    const ctx = makeContext({
      assignments: [a1],
      shiftMap: new Map([[s1.id, s1]]),
      staffMap,
    });
    expect(onCallLimitsRule.evaluate(ctx)).toHaveLength(0);
  });

  it("flags when staff has 2 on-call shifts in same week (exceeds limit of 1)", () => {
    const { assignment: a1, shift: s1 } = makeOnCallAssignment("2026-02-10", "a1");
    const { assignment: a2, shift: s2 } = makeOnCallAssignment("2026-02-11", "a2");
    const ctx = makeContext({
      assignments: [a1, a2],
      shiftMap: new Map([[s1.id, s1], [s2.id, s2]]),
      staffMap,
    });
    const violations = onCallLimitsRule.evaluate(ctx);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].ruleId).toBe("on-call-limits");
    expect(violations[0].description).toContain("exceeding limit of 1");
  });

  it("passes when on-call shifts are in different weeks", () => {
    const { assignment: a1, shift: s1 } = makeOnCallAssignment("2026-02-10", "a1"); // Week 1
    const { assignment: a2, shift: s2 } = makeOnCallAssignment("2026-02-17", "a2"); // Week 2
    const ctx = makeContext({
      assignments: [a1, a2],
      shiftMap: new Map([[s1.id, s1], [s2.id, s2]]),
      staffMap,
    });
    expect(onCallLimitsRule.evaluate(ctx)).toHaveLength(0);
  });

  it("ignores regular (non-on_call) shifts", () => {
    const regularShift = makeShift({ id: "day-1", shiftType: "day", date: "2026-02-10" });
    const a1 = makeAssignment({ id: "a1", shiftId: "day-1", staffId: "staff-1", date: "2026-02-10" });
    const ctx = makeContext({
      assignments: [a1],
      shiftMap: new Map([["day-1", regularShift]]),
      staffMap,
    });
    expect(onCallLimitsRule.evaluate(ctx)).toHaveLength(0);
  });

  it("flags 2 on-calls in the same Mon-Sun week spanning a year boundary", () => {
    // Mon 2026-12-28 … Sun 2027-01-03 is ONE week. Calendar-year week numbers
    // split it into 2026-W53 and 2027-W1, hiding the violation.
    const { assignment: a1, shift: s1 } = makeOnCallAssignment("2026-12-30", "a1"); // Wednesday
    const { assignment: a2, shift: s2 } = makeOnCallAssignment("2027-01-02", "a2"); // Saturday
    const ctx = makeContext({
      assignments: [a1, a2],
      shiftMap: new Map([[s1.id, s1], [s2.id, s2]]),
      staffMap,
    });
    const violations = onCallLimitsRule.evaluate(ctx);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].description).toContain("exceeding limit of 1");
  });

  it("treats Sat+Sun of one weekend as a single weekend for the monthly limit", () => {
    // Sat 2026-02-07 + Sun 2026-02-08 = one weekend; with limit 1 this passes.
    const { assignment: a1, shift: s1 } = makeOnCallAssignment("2026-02-07", "a1");
    const { assignment: a2, shift: s2 } = makeOnCallAssignment("2026-02-08", "a2");
    const ctx = makeContext({
      assignments: [a1, a2],
      shiftMap: new Map([[s1.id, s1], [s2.id, s2]]),
      staffMap,
      ruleParameters: { maxOnCallPerWeek: 2 }, // isolate the weekend check
    });
    const violations = onCallLimitsRule.evaluate(ctx);
    const weekendViolations = violations.filter((v) => v.description.includes("weekend"));
    expect(weekendViolations).toHaveLength(0);
  });
});

describe("max-hours-60 rule", () => {
  const staff = makeStaff({ id: "staff-1" });
  const staffMap = new Map([["staff-1", staff]]);

  it("passes when staff works exactly 60 hours in 7 days", () => {
    // 5 x 12h shifts = 60h
    const shifts = Array.from({ length: 5 }, (_, i) => {
      const date = new Date("2026-02-09");
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      const shift = makeShift({ id: `s${i}`, date: dateStr, durationHours: 12, countsTowardStaffing: true });
      const assignment = makeAssignment({ id: `a${i}`, shiftId: `s${i}`, staffId: "staff-1", date: dateStr, durationHours: 12 });
      return { shift, assignment };
    });
    const ctx = makeContext({
      assignments: shifts.map(s => s.assignment),
      shiftMap: new Map(shifts.map(s => [s.shift.id, s.shift])),
      staffMap,
    });
    expect(maxHoursRule.evaluate(ctx)).toHaveLength(0);
  });

  it("flags when staff exceeds 60 hours in a 7-day window", () => {
    // 6 x 12h shifts = 72h in 7 days
    const shiftsArr = Array.from({ length: 6 }, (_, i) => {
      const date = new Date("2026-02-09");
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      const shift = makeShift({ id: `s${i}`, date: dateStr, durationHours: 12, countsTowardStaffing: true });
      const assignment = makeAssignment({ id: `a${i}`, shiftId: `s${i}`, staffId: "staff-1", date: dateStr, durationHours: 12 });
      return { shift, assignment };
    });
    const ctx = makeContext({
      assignments: shiftsArr.map(s => s.assignment),
      shiftMap: new Map(shiftsArr.map(s => [s.shift.id, s.shift])),
      staffMap,
    });
    const violations = maxHoursRule.evaluate(ctx);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("max-hours-60");
    expect(violations[0].description).toContain("72 hours");
  });

  it("excludes shifts that don't count toward staffing", () => {
    // 6 x 12h shifts but first one is on-call (not counted)
    const shiftsArr = Array.from({ length: 6 }, (_, i) => {
      const date = new Date("2026-02-09");
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      const countsTowardStaffing = i !== 0; // First shift doesn't count
      const shift = makeShift({ id: `s${i}`, date: dateStr, durationHours: 12, countsTowardStaffing });
      const assignment = makeAssignment({ id: `a${i}`, shiftId: `s${i}`, staffId: "staff-1", date: dateStr, durationHours: 12 });
      return { shift, assignment };
    });
    const ctx = makeContext({
      assignments: shiftsArr.map(s => s.assignment),
      shiftMap: new Map(shiftsArr.map(s => [s.shift.id, s.shift])),
      staffMap,
    });
    // 5 counted shifts x 12h = 60h — at limit, not over
    expect(maxHoursRule.evaluate(ctx)).toHaveLength(0);
  });

  it("uses custom maxHours parameter", () => {
    // 4 x 12h = 48h. With maxHours=40, this should flag
    const shiftsArr = Array.from({ length: 4 }, (_, i) => {
      const date = new Date("2026-02-09");
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      const shift = makeShift({ id: `s${i}`, date: dateStr, durationHours: 12, countsTowardStaffing: true });
      const assignment = makeAssignment({ id: `a${i}`, shiftId: `s${i}`, staffId: "staff-1", date: dateStr, durationHours: 12 });
      return { shift, assignment };
    });
    const ctx = makeContext({
      assignments: shiftsArr.map(s => s.assignment),
      shiftMap: new Map(shiftsArr.map(s => [s.shift.id, s.shift])),
      staffMap,
      ruleParameters: { maxHours: 40 },
    });
    expect(maxHoursRule.evaluate(ctx)).toHaveLength(1);
  });
});
