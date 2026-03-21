import { describe, it, expect, beforeEach } from "vitest";
import { passesHardRules, getRejectionReasons, isICUUnit } from "@/lib/engine/scheduler/eligibility";
import { SchedulerState } from "@/lib/engine/scheduler/state";
import type { SchedulerContext } from "@/lib/engine/scheduler/types";
import type { StaffInfo, ShiftInfo } from "@/lib/engine/rules/types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeStaff(overrides: Partial<StaffInfo> = {}): StaffInfo {
  return {
    id: "staff-1",
    firstName: "Alice",
    lastName: "Smith",
    role: "RN",
    employmentType: "full_time",
    icuCompetencyLevel: 3,
    isChargeNurseQualified: false,
    certifications: [],
    fte: 1.0,
    reliabilityRating: 4,
    homeUnit: "Med-Surg",
    crossTrainedUnits: [],
    weekendExempt: false,
    isActive: true,
    preferences: null,
    ...overrides,
  };
}

function makeShift(overrides: Partial<ShiftInfo> = {}): ShiftInfo {
  return {
    id: "shift-1",
    date: "2026-02-09",
    shiftType: "day",
    startTime: "07:00",
    endTime: "19:00",
    durationHours: 12,
    requiredStaffCount: 3,
    requiresChargeNurse: false,
    actualCensus: null,
    unit: "Med-Surg",
    countsTowardStaffing: true,
    acuityLevel: null,
    acuityExtraStaff: 0,
    sitterCount: 0,
    ...overrides,
  };
}

function makeContext(overrides: Partial<SchedulerContext> = {}): SchedulerContext {
  return {
    scheduleId: "sched-1",
    shifts: [],
    staffList: [],
    staffMap: new Map(),
    prnAvailability: [],
    staffLeaves: [],
    unitConfig: {
      id: "unit-1",
      name: "Med-Surg",
      weekendRuleType: "count_per_period",
      weekendShiftsRequired: 3,
      schedulePeriodWeeks: 6,
      holidayShiftsRequired: 1,
      maxOnCallPerWeek: 1,
      maxOnCallWeekendsPerMonth: 1,
      maxConsecutiveWeekends: 2,
      minStaffDay: 3,
      minStaffNight: 2,
    },
    scheduleUnit: "Med-Surg",
    publicHolidays: [],
    ...overrides,
  };
}

// ─── isICUUnit ────────────────────────────────────────────────────────────────

describe("isICUUnit", () => {
  it("matches 'ICU'", () => expect(isICUUnit("ICU")).toBe(true));
  it("matches 'ER'", () => expect(isICUUnit("ER")).toBe(true));
  it("matches 'ED'", () => expect(isICUUnit("ED")).toBe(true));
  it("matches 'EMERGENCY'", () => expect(isICUUnit("EMERGENCY")).toBe(true));
  it("matches case-insensitively", () => expect(isICUUnit("icu")).toBe(true));
  it("matches multi-word like 'Medical ICU'", () => expect(isICUUnit("Medical ICU")).toBe(true));
  it("does not match 'Med-Surg'", () => expect(isICUUnit("Med-Surg")).toBe(false));
  it("does not match partial word 'PICU' as ICU", () => {
    // 'PICU' as a single word should NOT match because word boundary splits on hyphen/space/underscore
    // But PICU has no separator so it would be treated as one word → should not match ICU
    expect(isICUUnit("PICU")).toBe(false);
  });
});

// ─── passesHardRules ─────────────────────────────────────────────────────────

describe("passesHardRules", () => {
  let state: SchedulerState;
  let ctx: SchedulerContext;

  beforeEach(() => {
    state = new SchedulerState();
    ctx = makeContext();
  });

  it("passes for a clean, unconstrained assignment", () => {
    expect(passesHardRules(makeStaff(), makeShift(), state, ctx)).toBe(true);
  });

  // Rule 1: Approved leave
  it("blocks staff on approved leave", () => {
    ctx = makeContext({
      staffLeaves: [{
        staffId: "staff-1",
        status: "approved",
        startDate: "2026-02-09",
        endDate: "2026-02-09",
      }],
    });
    expect(passesHardRules(makeStaff(), makeShift(), state, ctx)).toBe(false);
  });

  it("does not block staff on pending leave", () => {
    ctx = makeContext({
      staffLeaves: [{
        staffId: "staff-1",
        status: "pending",
        startDate: "2026-02-09",
        endDate: "2026-02-09",
      }],
    });
    expect(passesHardRules(makeStaff(), makeShift(), state, ctx)).toBe(true);
  });

  // Rule 2: PRN availability
  it("blocks per_diem staff with no availability record", () => {
    const prnStaff = makeStaff({ employmentType: "per_diem" });
    expect(passesHardRules(prnStaff, makeShift(), state, ctx)).toBe(false);
  });

  it("blocks per_diem staff not available on this date", () => {
    const prnStaff = makeStaff({ employmentType: "per_diem" });
    ctx = makeContext({ prnAvailability: [{ staffId: "staff-1", availableDates: ["2026-02-10"] }] });
    expect(passesHardRules(prnStaff, makeShift(), state, ctx)).toBe(false);
  });

  it("allows per_diem staff available on this date", () => {
    const prnStaff = makeStaff({ employmentType: "per_diem" });
    ctx = makeContext({ prnAvailability: [{ staffId: "staff-1", availableDates: ["2026-02-09"] }] });
    expect(passesHardRules(prnStaff, makeShift(), state, ctx)).toBe(true);
  });

  // Rule 3: ICU competency
  it("blocks staff with competency < 2 on an ICU shift", () => {
    const lowComp = makeStaff({ icuCompetencyLevel: 1 });
    const icuShift = makeShift({ unit: "ICU" });
    expect(passesHardRules(lowComp, icuShift, state, ctx)).toBe(false);
  });

  it("allows staff with competency ≥ 2 on an ICU shift when a Level 4+ is already there", () => {
    const comp2 = makeStaff({ icuCompetencyLevel: 2 });
    const icuShift = makeShift({ id: "icu-shift", unit: "ICU" });
    // Pre-assign a Level 4 supervisor to the shift
    const level4 = makeStaff({ id: "senior", icuCompetencyLevel: 4 });
    ctx = makeContext({ staffMap: new Map([["staff-1", comp2], ["senior", level4]]) });
    state.addAssignment({
      shiftId: "icu-shift", staffId: "senior", date: "2026-02-09",
      shiftType: "day", startTime: "07:00", endTime: "19:00", durationHours: 12,
      unit: "ICU", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
    });
    expect(passesHardRules(comp2, icuShift, state, ctx)).toBe(true);
  });

  // Rule 3b: Level 1 requires Level 5 preceptor already on the shift
  it("blocks Level 1 staff when no Level 5 preceptor is on the shift yet", () => {
    const level1 = makeStaff({ icuCompetencyLevel: 1 });
    expect(passesHardRules(level1, makeShift(), state, ctx)).toBe(false);
  });

  it("allows Level 1 staff when a Level 5 preceptor is already on the shift", () => {
    const level1 = makeStaff({ icuCompetencyLevel: 1 });
    const level5 = makeStaff({ id: "expert", icuCompetencyLevel: 5 });
    ctx = makeContext({ staffMap: new Map([["staff-1", level1], ["expert", level5]]) });
    state.addAssignment({
      shiftId: "shift-1", staffId: "expert", date: "2026-02-09",
      shiftType: "day", startTime: "07:00", endTime: "19:00", durationHours: 12,
      unit: "Med-Surg", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
    });
    expect(passesHardRules(level1, makeShift(), state, ctx)).toBe(true);
  });

  // Rule 3c: Level 2 on ICU/ER requires Level 4+ already on the shift
  it("blocks Level 2 on ICU shift when no Level 4+ supervisor is on the shift yet", () => {
    const comp2 = makeStaff({ icuCompetencyLevel: 2 });
    const icuShift = makeShift({ unit: "ICU" });
    // No one else on the shift yet
    expect(passesHardRules(comp2, icuShift, state, ctx)).toBe(false);
  });

  it("blocks Level 2 on ICU shift when only Level 3 is assigned", () => {
    const comp2 = makeStaff({ icuCompetencyLevel: 2 });
    const level3 = makeStaff({ id: "mid", icuCompetencyLevel: 3 });
    const icuShift = makeShift({ id: "icu-s", unit: "ICU" });
    ctx = makeContext({ staffMap: new Map([["staff-1", comp2], ["mid", level3]]) });
    state.addAssignment({
      shiftId: "icu-s", staffId: "mid", date: "2026-02-09",
      shiftType: "day", startTime: "07:00", endTime: "19:00", durationHours: 12,
      unit: "ICU", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
    });
    expect(passesHardRules(comp2, icuShift, state, ctx)).toBe(false);
  });

  // Rule 4: No overlapping shifts
  it("blocks staff already assigned to an overlapping shift", () => {
    // Add a day shift 07:00–19:00 on Feb 9
    state.addAssignment({
      shiftId: "sh1", staffId: "staff-1", date: "2026-02-09",
      shiftType: "day", startTime: "07:00", endTime: "19:00", durationHours: 12,
      unit: "Med-Surg", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
    });
    // Try to assign another shift at 10:00–22:00 same day (overlaps)
    expect(passesHardRules(makeStaff(), makeShift({ startTime: "10:00" }), state, ctx)).toBe(false);
  });

  // Rule 5a: Backward rest hours (previous shift must end ≥10h before)
  it("blocks assignment that violates 10h rest rule (backward)", () => {
    // Night shift ends at 07:00 on Feb 10
    state.addAssignment({
      shiftId: "sh1", staffId: "staff-1", date: "2026-02-09",
      shiftType: "night", startTime: "19:00", endTime: "07:00", durationHours: 12,
      unit: "Med-Surg", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
    });
    // Try to assign day shift Feb 10 07:00 → only 0h rest
    expect(passesHardRules(makeStaff(), makeShift({ date: "2026-02-10" }), state, ctx)).toBe(false);
  });

  // Rule 5b: Forward rest hours (the KEY bug fix — night shift processed first,
  // day shift on the same date must be blocked even though night comes later in time)
  it("blocks a day shift when the same staff already has a night shift on the same day (forward rest check)", () => {
    // Night shift Feb 9: 19:00 → 07:00 Feb 10 (assigned first by difficulty ordering)
    state.addAssignment({
      shiftId: "sh-night", staffId: "staff-1", date: "2026-02-09",
      shiftType: "night", startTime: "19:00", endTime: "07:00", durationHours: 12,
      unit: "Med-Surg", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
    });
    // Now try to assign the day shift on Feb 9 (07:00-19:00).
    // The backward rest check finds nothing (night ends Feb 10 07:00, not before Feb 9 07:00).
    // The FORWARD rest check must catch: night starts at 19:00, which is 0h after day ends at 19:00.
    expect(passesHardRules(makeStaff(), makeShift({ date: "2026-02-09" }), state, ctx)).toBe(false);
  });

  it("allows a day shift when the next shift starts ≥10h after it ends", () => {
    // Next shift starts Feb 10 at 07:00 — which is 12h after Feb 9 day shift ends at 19:00
    state.addAssignment({
      shiftId: "sh-next", staffId: "staff-1", date: "2026-02-10",
      shiftType: "day", startTime: "07:00", endTime: "19:00", durationHours: 12,
      unit: "Med-Surg", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
    });
    // Feb 9 day shift ends 19:00; next shift starts Feb 10 07:00 → 12h gap → allowed
    expect(passesHardRules(makeStaff(), makeShift({ date: "2026-02-09" }), state, ctx)).toBe(true);
  });

  it("allows assignment with exactly 10h rest", () => {
    // Day shift Mon: 07:00–19:00
    state.addAssignment({
      shiftId: "sh1", staffId: "staff-1", date: "2026-02-09",
      shiftType: "day", startTime: "07:00", endTime: "19:00", durationHours: 12,
      unit: "Med-Surg", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
    });
    // Next shift Tue at 05:00 → 10h rest (19:00 to 05:00 = 10h) — exactly 10h, should pass
    expect(passesHardRules(makeStaff(), makeShift({ date: "2026-02-10", startTime: "05:00" }), state, ctx)).toBe(true);
  });

  // Rule 6: Max consecutive days
  it("blocks when adding this shift would exceed 5 consecutive days", () => {
    // Mon–Fri already assigned (5 days)
    ["2026-02-09", "2026-02-10", "2026-02-11", "2026-02-12", "2026-02-13"].forEach((d, i) => {
      state.addAssignment({
        shiftId: `sh${i}`, staffId: "staff-1", date: d,
        shiftType: "day", startTime: "07:00", endTime: "19:00", durationHours: 12,
        unit: "Med-Surg", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
      });
    });
    // Adding Sat (6th consecutive day) should be blocked
    expect(passesHardRules(makeStaff(), makeShift({ date: "2026-02-14" }), state, ctx)).toBe(false);
  });

  // Rule 7: Max 60h rolling 7-day window
  it("blocks when adding shift would exceed 60h in 7 days", () => {
    // 5 × 12h = 60h already in the 7-day window
    ["2026-02-09", "2026-02-10", "2026-02-11", "2026-02-12", "2026-02-13"].forEach((d, i) => {
      state.addAssignment({
        shiftId: `sh${i}`, staffId: "staff-1", date: d,
        shiftType: "day", startTime: "07:00", endTime: "19:00", durationHours: 12,
        unit: "Med-Surg", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
      });
    });
    // Adding another 12h would push to 72h → blocked
    expect(passesHardRules(makeStaff(), makeShift({ date: "2026-02-15" }), state, ctx)).toBe(false);
  });

  // Rule 8: On-call limits
  it("blocks on_call shift when weekly limit is already reached", () => {
    state.addAssignment({
      shiftId: "sh1", staffId: "staff-1", date: "2026-02-09",
      shiftType: "on_call", startTime: "07:00", endTime: "19:00", durationHours: 12,
      unit: "Med-Surg", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
    });
    // maxOnCallPerWeek=1 → second on-call this week should be blocked
    expect(passesHardRules(makeStaff(), makeShift({ date: "2026-02-10", shiftType: "on_call" }), state, ctx)).toBe(false);
  });

  it("allows on_call when under the weekly limit", () => {
    expect(passesHardRules(makeStaff(), makeShift({ shiftType: "on_call" }), state, ctx)).toBe(true);
  });
});

// ─── getRejectionReasons ──────────────────────────────────────────────────────

describe("getRejectionReasons", () => {
  it("returns empty array when no hard rules violated", () => {
    const state = new SchedulerState();
    const ctx = makeContext();
    expect(getRejectionReasons(makeStaff(), makeShift(), state, ctx)).toHaveLength(0);
  });

  it("reports 'on approved leave'", () => {
    const state = new SchedulerState();
    const ctx = makeContext({
      staffLeaves: [{ staffId: "staff-1", status: "approved", startDate: "2026-02-09", endDate: "2026-02-09" }],
    });
    const reasons = getRejectionReasons(makeStaff(), makeShift(), state, ctx);
    expect(reasons).toContain("on approved leave");
  });

  it("reports competency issue", () => {
    const state = new SchedulerState();
    const ctx = makeContext();
    const reasons = getRejectionReasons(makeStaff({ icuCompetencyLevel: 1 }), makeShift({ unit: "ICU" }), state, ctx);
    expect(reasons.some((r) => r.includes("competency"))).toBe(true);
  });

  it("reports insufficient rest", () => {
    const state = new SchedulerState();
    // Night shift Feb 9 ends Feb 10 07:00
    state.addAssignment({
      shiftId: "sh1", staffId: "staff-1", date: "2026-02-09",
      shiftType: "night", startTime: "19:00", endTime: "07:00", durationHours: 12,
      unit: "Med-Surg", isChargeNurse: false, isOvertime: false, isFloat: false, floatFromUnit: null,
    });
    const ctx = makeContext();
    // Try day shift Feb 10 07:00 → 0h rest
    const reasons = getRejectionReasons(makeStaff(), makeShift({ date: "2026-02-10" }), state, ctx);
    expect(reasons.some((r) => r.includes("rest"))).toBe(true);
  });

  it("can report multiple reasons simultaneously", () => {
    const state = new SchedulerState();
    // ICU shift + low competency + on approved leave
    const ctx = makeContext({
      staffLeaves: [{ staffId: "staff-1", status: "approved", startDate: "2026-02-09", endDate: "2026-02-09" }],
    });
    const reasons = getRejectionReasons(makeStaff({ icuCompetencyLevel: 1 }), makeShift({ unit: "ICU" }), state, ctx);
    expect(reasons.length).toBeGreaterThanOrEqual(2);
  });
});
