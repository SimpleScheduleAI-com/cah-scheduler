import { describe, it, expect } from "vitest";
import {
  validateSwap,
  validateSwapSide,
  shiftsOverlap,
  computeRestGapMins,
  type SwapSideParams,
} from "@/lib/swap/validate-swap";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSide(overrides: Partial<SwapSideParams> = {}): SwapSideParams {
  return {
    staff: {
      id: "staff-1",
      name: "Alice Smith",
      role: "RN",
      icuCompetencyLevel: 3,
      isChargeNurseQualified: false,
    },
    takesShift: {
      date: "2026-03-10",
      startTime: "07:00",
      endTime: "19:00",
      isChargeNurse: false,
      unit: "ICU",
    },
    coworkersOnTakesShift: [{ icuCompetencyLevel: 4 }],
    otherAssignmentsOnDate: [],
    adjacentAssignments: [],
    hasApprovedLeave: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// shiftsOverlap (unit tests)
// ---------------------------------------------------------------------------

describe("shiftsOverlap", () => {
  it("returns false when shifts are entirely separate", () => {
    expect(shiftsOverlap("07:00", "19:00", "19:00", "07:00")).toBe(false);
  });

  it("returns true when shifts overlap in the middle of the day", () => {
    expect(shiftsOverlap("07:00", "15:00", "13:00", "21:00")).toBe(true);
  });

  it("returns false when shifts are back-to-back with no gap", () => {
    // Day ends at 19:00, night starts at 19:00 — boundaries touch, no overlap
    expect(shiftsOverlap("07:00", "19:00", "19:00", "07:00")).toBe(false);
  });

  it("detects overlap when two overnight shifts on the same date share time", () => {
    // Both shifts start in the evening and end past midnight — they overlap
    expect(shiftsOverlap("19:00", "07:00", "20:00", "08:00")).toBe(true);
  });

  it("does not flag a morning shift (06:00–12:00) as overlapping with a night shift (19:00–07:00) on the same date", () => {
    // The morning shift ends at 12:00; the night shift starts at 19:00 — no overlap on that calendar date
    expect(shiftsOverlap("19:00", "07:00", "06:00", "12:00")).toBe(false);
  });

  it("returns true for identical time ranges", () => {
    expect(shiftsOverlap("07:00", "19:00", "07:00", "19:00")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateSwapSide — individual checks
// ---------------------------------------------------------------------------

describe("validateSwapSide", () => {
  it("passes for a fully eligible Level 3 RN", () => {
    const violations = validateSwapSide(makeSide());
    expect(violations).toHaveLength(0);
  });

  it("flags Level 1 staff (below ICU minimum of 2)", () => {
    const side = makeSide({
      staff: { id: "s1", name: "Bob", role: "RN", icuCompetencyLevel: 1, isChargeNurseQualified: false },
    });
    const violations = validateSwapSide(side);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("icu-competency");
    expect(violations[0].staffId).toBe("s1");
  });

  it("flags Level 3 staff taking a charge nurse assignment", () => {
    const side = makeSide({
      staff: { id: "s1", name: "Carol", role: "RN", icuCompetencyLevel: 3, isChargeNurseQualified: true },
      takesShift: { date: "2026-03-10", startTime: "07:00", endTime: "19:00", isChargeNurse: true, unit: "ICU" },
    });
    const violations = validateSwapSide(side);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("charge-nurse");
    expect(violations[0].description).toContain("Level 4 or above");
  });

  it("passes Level 4 staff taking a charge nurse assignment", () => {
    const side = makeSide({
      staff: { id: "s1", name: "Dan", role: "RN", icuCompetencyLevel: 4, isChargeNurseQualified: true },
      takesShift: { date: "2026-03-10", startTime: "07:00", endTime: "19:00", isChargeNurse: true, unit: "ICU" },
    });
    expect(validateSwapSide(side)).toHaveLength(0);
  });

  it("flags Level 2 staff with no Level 4+ coworker (supervision violation)", () => {
    const side = makeSide({
      staff: { id: "s1", name: "Eve", role: "RN", icuCompetencyLevel: 2, isChargeNurseQualified: false },
      coworkersOnTakesShift: [{ icuCompetencyLevel: 3 }, { icuCompetencyLevel: 2 }],
    });
    const violations = validateSwapSide(side);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("competency-pairing");
  });

  it("passes Level 2 staff when a Level 4+ coworker is present", () => {
    const side = makeSide({
      staff: { id: "s1", name: "Frank", role: "RN", icuCompetencyLevel: 2, isChargeNurseQualified: false },
      coworkersOnTakesShift: [{ icuCompetencyLevel: 4 }, { icuCompetencyLevel: 2 }],
    });
    expect(validateSwapSide(side)).toHaveLength(0);
  });

  it("flags approved leave conflict", () => {
    const side = makeSide({ hasApprovedLeave: true });
    const violations = validateSwapSide(side);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("leave-conflict");
  });

  it("flags same-date overlapping shift", () => {
    const side = makeSide({
      otherAssignmentsOnDate: [{ startTime: "13:00", endTime: "21:00" }],
    });
    const violations = validateSwapSide(side);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("no-overlapping-shifts");
  });

  it("does not flag non-overlapping same-date shift", () => {
    const side = makeSide({
      // Staff has a 19:00–07:00 night shift; they are taking a 07:00–19:00 day shift
      // End of day touches start of night — no overlap
      otherAssignmentsOnDate: [{ startTime: "19:00", endTime: "07:00" }],
    });
    expect(validateSwapSide(side)).toHaveLength(0);
  });

  it("reports multiple violations simultaneously", () => {
    // Level 1, charge nurse required, AND approved leave
    const side = makeSide({
      staff: { id: "s1", name: "Grace", role: "RN", icuCompetencyLevel: 1, isChargeNurseQualified: false },
      takesShift: { date: "2026-03-10", startTime: "07:00", endTime: "19:00", isChargeNurse: true, unit: "ICU" },
      hasApprovedLeave: true,
    });
    const violations = validateSwapSide(side);
    // icu-competency + charge-nurse + leave-conflict (level 1 < 4 covers charge too)
    const ruleIds = violations.map(v => v.ruleId);
    expect(ruleIds).toContain("icu-competency");
    expect(ruleIds).toContain("charge-nurse");
    expect(ruleIds).toContain("leave-conflict");
  });
});

// ---------------------------------------------------------------------------
// validateSwap — both sides together
// ---------------------------------------------------------------------------

describe("validateSwapSide — 60h rolling window", () => {
  it("flags when taking the shift would exceed 60h in a rolling 7-day window", () => {
    // 48h already worked Mar 5–8; taking a 13h shift on Mar 10 = 61h in the
    // window Mar 5–11.
    const side = makeSide({
      takesShift: {
        date: "2026-03-10",
        startTime: "07:00",
        endTime: "20:00",
        isChargeNurse: false,
        unit: "ICU",
      },
      takesShiftDurationHours: 13,
      windowAssignments: [
        { date: "2026-03-05", durationHours: 12 },
        { date: "2026-03-06", durationHours: 12 },
        { date: "2026-03-07", durationHours: 12 },
        { date: "2026-03-08", durationHours: 12 },
      ],
    });
    const violations = validateSwapSide(side);
    expect(violations.some((v) => v.ruleId === "max-hours-60")).toBe(true);
  });

  it("passes at exactly 60h in the worst window", () => {
    const side = makeSide({
      takesShiftDurationHours: 12,
      windowAssignments: [
        { date: "2026-03-05", durationHours: 12 },
        { date: "2026-03-06", durationHours: 12 },
        { date: "2026-03-07", durationHours: 12 },
        { date: "2026-03-08", durationHours: 12 },
      ],
    });
    const violations = validateSwapSide(side);
    expect(violations.some((v) => v.ruleId === "max-hours-60")).toBe(false);
  });

  it("catches a forward window that starts on the taken shift's date", () => {
    // Nothing before Mar 10, but 52h already scheduled Mar 11–16 — adding 12h
    // on Mar 10 makes the window Mar 10–16 total 64h.
    const side = makeSide({
      takesShiftDurationHours: 12,
      windowAssignments: [
        { date: "2026-03-11", durationHours: 12 },
        { date: "2026-03-12", durationHours: 12 },
        { date: "2026-03-13", durationHours: 12 },
        { date: "2026-03-14", durationHours: 8 },
        { date: "2026-03-16", durationHours: 8 },
      ],
    });
    const violations = validateSwapSide(side);
    expect(violations.some((v) => v.ruleId === "max-hours-60")).toBe(true);
  });

  it("does not flag when window data is not provided (backward compatibility)", () => {
    const violations = validateSwapSide(makeSide());
    expect(violations.some((v) => v.ruleId === "max-hours-60")).toBe(false);
  });
});

describe("validateSwapSide — max consecutive days", () => {
  it("flags when taking the shift would create a 6th consecutive working day", () => {
    const side = makeSide({
      windowAssignments: [
        { date: "2026-03-05", durationHours: 8 },
        { date: "2026-03-06", durationHours: 8 },
        { date: "2026-03-07", durationHours: 8 },
        { date: "2026-03-08", durationHours: 8 },
        { date: "2026-03-09", durationHours: 8 },
      ],
      takesShiftDurationHours: 8,
    });
    const violations = validateSwapSide(side);
    expect(violations.some((v) => v.ruleId === "max-consecutive")).toBe(true);
  });

  it("flags when the taken shift bridges two runs into an over-limit streak", () => {
    // Worked Mar 7–9 and Mar 11–13; taking Mar 10 creates a 7-day run.
    const side = makeSide({
      windowAssignments: [
        { date: "2026-03-07", durationHours: 8 },
        { date: "2026-03-08", durationHours: 8 },
        { date: "2026-03-09", durationHours: 8 },
        { date: "2026-03-11", durationHours: 8 },
        { date: "2026-03-12", durationHours: 8 },
        { date: "2026-03-13", durationHours: 8 },
      ],
      takesShiftDurationHours: 8,
    });
    const violations = validateSwapSide(side);
    expect(violations.some((v) => v.ruleId === "max-consecutive")).toBe(true);
  });

  it("passes a 5-day streak (at the limit)", () => {
    const side = makeSide({
      windowAssignments: [
        { date: "2026-03-06", durationHours: 8 },
        { date: "2026-03-07", durationHours: 8 },
        { date: "2026-03-08", durationHours: 8 },
        { date: "2026-03-09", durationHours: 8 },
      ],
      takesShiftDurationHours: 8,
    });
    const violations = validateSwapSide(side);
    expect(violations.some((v) => v.ruleId === "max-consecutive")).toBe(false);
  });
});

describe("validateSwap", () => {
  it("passes when both sides are fully eligible", () => {
    const requesting = makeSide({
      staff: { id: "s1", name: "Alice", role: "RN", icuCompetencyLevel: 3, isChargeNurseQualified: false },
    });
    const target = makeSide({
      staff: { id: "s2", name: "Bob", role: "RN", icuCompetencyLevel: 4, isChargeNurseQualified: true },
      takesShift: { date: "2026-03-11", startTime: "19:00", endTime: "07:00", isChargeNurse: false, unit: "ICU" },
    });
    expect(validateSwap(requesting, target)).toHaveLength(0);
  });

  it("catches a violation on the requesting side only", () => {
    // Emily Davis (Level 3) tries to take a charge nurse slot she can't fill
    const requesting = makeSide({
      staff: { id: "emily", name: "Emily Davis", role: "RN", icuCompetencyLevel: 3, isChargeNurseQualified: false },
      takesShift: { date: "2026-03-10", startTime: "07:00", endTime: "19:00", isChargeNurse: true, unit: "ICU" },
    });
    const target = makeSide({
      staff: { id: "ashley", name: "Ashley Johnson", role: "RN", icuCompetencyLevel: 4, isChargeNurseQualified: true },
      takesShift: { date: "2026-03-11", startTime: "07:00", endTime: "19:00", isChargeNurse: false, unit: "ICU" },
    });
    const violations = validateSwap(requesting, target);
    expect(violations.some(v => v.staffId === "emily" && v.ruleId === "charge-nurse")).toBe(true);
    expect(violations.every(v => v.staffId !== "ashley")).toBe(true);
  });

  it("catches a violation on the target side (Level 2 taking charge role)", () => {
    // Level 2 staff taking a charge nurse slot — no Level 4+ will remain on their new shift
    const requesting = makeSide({
      staff: { id: "s1", name: "Alice", role: "RN", icuCompetencyLevel: 5, isChargeNurseQualified: true },
      takesShift: { date: "2026-03-10", startTime: "07:00", endTime: "19:00", isChargeNurse: false, unit: "ICU" },
    });
    const target = makeSide({
      staff: { id: "lvl2", name: "Level2 Nurse", role: "RN", icuCompetencyLevel: 2, isChargeNurseQualified: false },
      takesShift: {
        date: "2026-03-11", startTime: "07:00", endTime: "19:00", isChargeNurse: true, unit: "ICU",
      },
      coworkersOnTakesShift: [{ icuCompetencyLevel: 3 }], // no Level 4+ on the shift they'd take
    });
    const violations = validateSwap(requesting, target);
    const targetViolations = violations.filter(v => v.staffId === "lvl2");
    expect(targetViolations.some(v => v.ruleId === "charge-nurse")).toBe(true);
  });

  it("catches violations on both sides", () => {
    // Both staff have approved leave on the dates they'd be swapping to
    const s1 = makeSide({ hasApprovedLeave: true });
    const s2 = makeSide({
      staff: { id: "s2", name: "Bob", role: "RN", icuCompetencyLevel: 3, isChargeNurseQualified: false },
      hasApprovedLeave: true,
    });
    const violations = validateSwap(s1, s2);
    expect(violations.filter(v => v.ruleId === "leave-conflict")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// computeRestGapMins (unit tests)
// ---------------------------------------------------------------------------

describe("computeRestGapMins", () => {
  it("normal day shift on D-1 ending 19:00, new shift starts 07:00 on D → 12h rest", () => {
    // 24:00 - 19:00 + 7:00 = 12h
    expect(computeRestGapMins("19:00", false, "07:00")).toBe(12 * 60);
  });

  it("normal shift ending 19:00, next starts 05:00 → exactly 10h", () => {
    expect(computeRestGapMins("19:00", false, "05:00")).toBe(10 * 60);
  });

  it("normal shift ending 22:00, next starts 07:00 → only 9h (violation territory)", () => {
    expect(computeRestGapMins("22:00", false, "07:00")).toBe(9 * 60);
  });

  it("overnight shift (ends 07:00 on D), new shift starts 19:00 on D → 12h rest", () => {
    // Overnight flag = true: gap = 19:00 - 07:00 = 12h
    expect(computeRestGapMins("07:00", true, "19:00")).toBe(12 * 60);
  });

  it("overnight shift ending 07:00, new shift starts 07:00 → 0h rest", () => {
    expect(computeRestGapMins("07:00", true, "07:00")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// validateSwapSide — rest-hours checks
// ---------------------------------------------------------------------------

describe("validateSwapSide rest-hours", () => {
  it("passes when no adjacent assignments exist", () => {
    const side = makeSide({ adjacentAssignments: [] });
    expect(validateSwapSide(side)).toHaveLength(0);
  });

  it("passes when D-1 shift leaves exactly 10h rest (07:00 start, D-1 ends 21:00)", () => {
    // 24h - 21h + 7h = 10h exactly — boundary pass
    const side = makeSide({
      takesShift: { date: "2026-03-10", startTime: "07:00", endTime: "19:00", isChargeNurse: false, unit: "ICU" },
      adjacentAssignments: [{ date: "2026-03-09", startTime: "09:00", endTime: "21:00" }],
    });
    expect(validateSwapSide(side).filter(v => v.ruleId === "rest-hours")).toHaveLength(0);
  });

  it("flags a D-1 assignment that leaves only 9h rest", () => {
    // D-1 shift ends 22:00, new shift starts 07:00 → 9h rest (< 10h)
    const side = makeSide({
      takesShift: { date: "2026-03-10", startTime: "07:00", endTime: "19:00", isChargeNurse: false, unit: "ICU" },
      adjacentAssignments: [{ date: "2026-03-09", startTime: "10:00", endTime: "22:00" }],
    });
    const violations = validateSwapSide(side).filter(v => v.ruleId === "rest-hours");
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("9h rest before");
  });

  it("flags a D+1 assignment that leaves only 8h rest after an overnight shift", () => {
    // Overnight shift ends 07:00 on D+1, D+1 shift starts 15:00 on D+1 → 8h rest
    const side = makeSide({
      takesShift: { date: "2026-03-10", startTime: "19:00", endTime: "07:00", isChargeNurse: false, unit: "ICU" },
      adjacentAssignments: [{ date: "2026-03-11", startTime: "15:00", endTime: "23:00" }],
    });
    const violations = validateSwapSide(side).filter(v => v.ruleId === "rest-hours");
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("8h rest after");
  });

  it("passes when D+1 assignment starts 12h after a day shift ends", () => {
    // Day shift ends 19:00 on D, D+1 shift starts 07:00 → 12h rest
    const side = makeSide({
      takesShift: { date: "2026-03-10", startTime: "07:00", endTime: "19:00", isChargeNurse: false, unit: "ICU" },
      adjacentAssignments: [{ date: "2026-03-11", startTime: "07:00", endTime: "19:00" }],
    });
    expect(validateSwapSide(side).filter(v => v.ruleId === "rest-hours")).toHaveLength(0);
  });

  it("overnight D-1 shift ending 07:00 gives 0h rest if new shift also starts 07:00 (flags)", () => {
    // D-1 overnight ends 07:00, new shift starts 07:00 → 0h
    const side = makeSide({
      takesShift: { date: "2026-03-10", startTime: "07:00", endTime: "19:00", isChargeNurse: false, unit: "ICU" },
      adjacentAssignments: [{ date: "2026-03-09", startTime: "19:00", endTime: "07:00" }],
    });
    const violations = validateSwapSide(side).filter(v => v.ruleId === "rest-hours");
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("0h rest before");
  });
});
