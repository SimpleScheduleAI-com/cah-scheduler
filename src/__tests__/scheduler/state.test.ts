import { describe, it, expect, beforeEach } from "vitest";
import { SchedulerState, toDateTime, shiftEndDateTime, getWeekStart } from "@/lib/engine/scheduler/state";
import type { AssignmentDraft } from "@/lib/engine/scheduler/types";

function makeDraft(overrides: Partial<AssignmentDraft> = {}): AssignmentDraft {
  return {
    shiftId: "shift-1",
    staffId: "staff-1",
    date: "2026-02-09", // Monday
    shiftType: "day",
    startTime: "07:00",
    endTime: "19:00",
    durationHours: 12,
    unit: "Med-Surg",
    isChargeNurse: false,
    isOvertime: false,
    isFloat: false,
    floatFromUnit: null,
    ...overrides,
  };
}

describe("toDateTime", () => {
  it("parses date and time correctly", () => {
    const dt = toDateTime("2026-02-09", "07:30");
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getMonth()).toBe(1); // 0-indexed
    expect(dt.getDate()).toBe(9);
    expect(dt.getHours()).toBe(7);
    expect(dt.getMinutes()).toBe(30);
  });
});

describe("shiftEndDateTime", () => {
  it("adds duration to start time", () => {
    const end = shiftEndDateTime("2026-02-09", "07:00", 12);
    expect(end.getHours()).toBe(19);
    expect(end.getDate()).toBe(9);
  });

  it("crosses midnight for night shifts", () => {
    const end = shiftEndDateTime("2026-02-09", "19:00", 12);
    expect(end.getDate()).toBe(10); // next day
    expect(end.getHours()).toBe(7);
  });
});

describe("getWeekStart", () => {
  it("returns Monday for a Wednesday", () => {
    const ws = getWeekStart("2026-02-11"); // Wednesday
    expect(ws).toBe("2026-02-09"); // Monday
  });

  it("returns Monday for a Sunday", () => {
    const ws = getWeekStart("2026-02-15"); // Sunday
    expect(ws).toBe("2026-02-09"); // preceding Monday
  });

  it("returns the date itself when it is Monday", () => {
    const ws = getWeekStart("2026-02-09"); // Monday
    expect(ws).toBe("2026-02-09");
  });
});

describe("SchedulerState", () => {
  let state: SchedulerState;

  beforeEach(() => {
    state = new SchedulerState();
  });

  describe("addAssignment and getStaffAssignments", () => {
    it("stores and retrieves assignments", () => {
      state.addAssignment(makeDraft({ staffId: "s1", shiftId: "sh1" }));
      expect(state.getStaffAssignments("s1")).toHaveLength(1);
    });

    it("keeps list sorted by date then start time", () => {
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-11", shiftId: "sh2" }));
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", shiftId: "sh1" }));
      const list = state.getStaffAssignments("s1");
      expect(list[0].date).toBe("2026-02-09");
      expect(list[1].date).toBe("2026-02-11");
    });

    it("returns empty array for unknown staff", () => {
      expect(state.getStaffAssignments("nobody")).toHaveLength(0);
    });
  });

  describe("getShiftAssignments", () => {
    it("returns all staff assigned to a shift", () => {
      state.addAssignment(makeDraft({ staffId: "s1", shiftId: "sh1" }));
      state.addAssignment(makeDraft({ staffId: "s2", shiftId: "sh1" }));
      expect(state.getShiftAssignments("sh1")).toHaveLength(2);
    });
  });

  describe("getLastShiftEndBefore", () => {
    it("returns null when no previous assignments", () => {
      const newStart = toDateTime("2026-02-10", "07:00");
      expect(state.getLastShiftEndBefore("s1", newStart)).toBeNull();
    });

    it("returns the end of the most recent preceding shift", () => {
      // day shift Mon: ends 19:00
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", startTime: "07:00", durationHours: 12, shiftId: "sh1" }));
      // new shift Tue starts 07:00
      const newStart = toDateTime("2026-02-10", "07:00");
      const lastEnd = state.getLastShiftEndBefore("s1", newStart);
      expect(lastEnd).not.toBeNull();
      // End should be 19:00 Mon = 7pm
      expect(lastEnd!.getHours()).toBe(19);
    });

    it("ignores shifts that start after the new shift", () => {
      // future shift Tue ends Wed 07:00
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-10", startTime: "19:00", durationHours: 12, shiftId: "sh1" }));
      const newStart = toDateTime("2026-02-09", "07:00"); // Mon — before the future shift
      expect(state.getLastShiftEndBefore("s1", newStart)).toBeNull();
    });
  });

  describe("getNextShiftStartAfter", () => {
    it("returns null when no future assignments exist", () => {
      const newEnd = shiftEndDateTime("2026-02-09", "07:00", 12); // 19:00 Feb 9
      expect(state.getNextShiftStartAfter("s1", newEnd)).toBeNull();
    });

    it("returns the start of the next shift after newEnd", () => {
      // Night shift Feb 9: 19:00 → 07:00 Feb 10
      state.addAssignment(makeDraft({
        staffId: "s1", date: "2026-02-09", startTime: "19:00",
        shiftType: "night", endTime: "07:00", durationHours: 12, shiftId: "sh1",
      }));
      // newEnd = 19:00 Feb 9 (end of a hypothetical day shift on Feb 9)
      const newEnd = shiftEndDateTime("2026-02-09", "07:00", 12);
      const next = state.getNextShiftStartAfter("s1", newEnd);
      expect(next).not.toBeNull();
      expect(next!.getHours()).toBe(19); // night starts at 19:00
      expect(next!.getDate()).toBe(9);
    });

    it("returns the earliest future shift when there are multiple", () => {
      // Two future shifts: Feb 10 at 07:00 and Feb 11 at 07:00
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-11", startTime: "07:00", shiftId: "sh2" }));
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-10", startTime: "07:00", shiftId: "sh1" }));
      const newEnd = shiftEndDateTime("2026-02-09", "07:00", 12); // 19:00 Feb 9
      const next = state.getNextShiftStartAfter("s1", newEnd);
      expect(next!.getDate()).toBe(10); // earliest is Feb 10
    });

    it("ignores shifts at exactly newEnd (uses >=, so same-time start is included)", () => {
      // Shift starting exactly at newEnd
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", startTime: "19:00", shiftId: "sh1" }));
      const newEnd = shiftEndDateTime("2026-02-09", "07:00", 12); // 19:00 Feb 9
      const next = state.getNextShiftStartAfter("s1", newEnd);
      // 19:00 >= 19:00 → included (0h gap, which triggers rest violation in eligibility)
      expect(next).not.toBeNull();
    });
  });

  describe("wouldExceedConsecutiveDays", () => {
    it("returns false for first assignment", () => {
      expect(state.wouldExceedConsecutiveDays("s1", "2026-02-09", 5)).toBe(false);
    });

    it("returns false when consecutive count equals max", () => {
      // 4 consecutive days Mon–Thu
      ["2026-02-09", "2026-02-10", "2026-02-11", "2026-02-12"].forEach((d, i) =>
        state.addAssignment(makeDraft({ staffId: "s1", date: d, shiftId: `sh${i}` }))
      );
      // Adding Fri = 5 consecutive (Mon–Fri) → equals max 5, should NOT exceed
      expect(state.wouldExceedConsecutiveDays("s1", "2026-02-13", 5)).toBe(false);
    });

    it("returns true when consecutive count would exceed max", () => {
      // 5 consecutive days Mon–Fri
      ["2026-02-09", "2026-02-10", "2026-02-11", "2026-02-12", "2026-02-13"].forEach((d, i) =>
        state.addAssignment(makeDraft({ staffId: "s1", date: d, shiftId: `sh${i}` }))
      );
      // Adding Sat = 6 consecutive → exceeds max 5
      expect(state.wouldExceedConsecutiveDays("s1", "2026-02-14", 5)).toBe(true);
    });

    it("does not count non-consecutive days", () => {
      // Mon and Wed — gap on Tue
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", shiftId: "sh1" }));
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-11", shiftId: "sh2" }));
      // Adding Tue (which joins the two) should only be 3 consecutive total
      expect(state.wouldExceedConsecutiveDays("s1", "2026-02-10", 5)).toBe(false);
    });
  });

  describe("getWeeklyHours", () => {
    it("returns 0 when no assignments this week", () => {
      expect(state.getWeeklyHours("s1", "2026-02-09")).toBe(0);
    });

    it("sums hours within the same Mon–Sun week", () => {
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", durationHours: 12, shiftId: "sh1" }));
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-11", durationHours: 12, shiftId: "sh2" }));
      expect(state.getWeeklyHours("s1", "2026-02-11")).toBe(24);
    });

    it("does not include hours from a different week", () => {
      // Previous week (Mon Feb 2)
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-02", durationHours: 12, shiftId: "sh1" }));
      // This week (Mon Feb 9)
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", durationHours: 12, shiftId: "sh2" }));
      expect(state.getWeeklyHours("s1", "2026-02-09")).toBe(12);
    });
  });

  describe("getRolling7DayHours", () => {
    it("sums hours in the 7-day window ending on the given date", () => {
      // 6 days ago from Feb 15 = Feb 9
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", durationHours: 12, shiftId: "sh1" }));
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-14", durationHours: 12, shiftId: "sh2" }));
      expect(state.getRolling7DayHours("s1", "2026-02-15")).toBe(24);
    });

    it("excludes dates outside the 7-day window", () => {
      // 8 days ago = Feb 7, should be excluded when checking Feb 15
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-07", durationHours: 12, shiftId: "sh1" }));
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-15", durationHours: 12, shiftId: "sh2" }));
      expect(state.getRolling7DayHours("s1", "2026-02-15")).toBe(12);
    });
  });

  describe("getWeekendCount", () => {
    it("counts Saturday+Sunday of the same week as ONE weekend unit", () => {
      // Industry standard: working both days of the same weekend = 1 worked weekend, not 2
      // 2026-02-14 is Saturday, 2026-02-15 is Sunday (same weekend unit)
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-14", shiftId: "sh1" }));
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-15", shiftId: "sh2" }));
      expect(state.getWeekendCount("s1")).toBe(1);
    });

    it("counts two different weekends as 2 weekend units", () => {
      // 2026-02-14 = Saturday of week 1, 2026-02-21 = Saturday of week 2
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-14", shiftId: "sh1" }));
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-21", shiftId: "sh2" }));
      expect(state.getWeekendCount("s1")).toBe(2);
    });

    it("does not count weekday assignments", () => {
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", shiftId: "sh1" })); // Monday
      expect(state.getWeekendCount("s1")).toBe(0);
    });
  });

  describe("getOnCallCountThisWeek", () => {
    it("counts on_call shifts in the current week only", () => {
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", shiftType: "on_call", shiftId: "sh1" }));
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-10", shiftType: "on_call", shiftId: "sh2" }));
      // Previous week
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-02", shiftType: "on_call", shiftId: "sh3" }));
      expect(state.getOnCallCountThisWeek("s1", "2026-02-09")).toBe(2);
    });

    it("does not count non-on_call shifts", () => {
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", shiftType: "day", shiftId: "sh1" }));
      expect(state.getOnCallCountThisWeek("s1", "2026-02-09")).toBe(0);
    });
  });

  describe("hasOverlapWith", () => {
    it("returns false when no assignments", () => {
      const s = toDateTime("2026-02-09", "07:00");
      const e = toDateTime("2026-02-09", "19:00");
      expect(state.hasOverlapWith("s1", s, e)).toBe(false);
    });

    it("detects overlap for same time window", () => {
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", startTime: "07:00", durationHours: 12, shiftId: "sh1" }));
      const s = toDateTime("2026-02-09", "07:00");
      const e = shiftEndDateTime("2026-02-09", "07:00", 12);
      expect(state.hasOverlapWith("s1", s, e)).toBe(true);
    });

    it("detects partial overlap", () => {
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", startTime: "07:00", durationHours: 12, shiftId: "sh1" }));
      // New shift starts at 15:00, still within 07:00–19:00
      const s = toDateTime("2026-02-09", "15:00");
      const e = shiftEndDateTime("2026-02-09", "15:00", 12);
      expect(state.hasOverlapWith("s1", s, e)).toBe(true);
    });

    it("returns false for adjacent (non-overlapping) shifts", () => {
      state.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-09", startTime: "07:00", durationHours: 12, shiftId: "sh1" }));
      // Next shift starts exactly when previous ends (19:00)
      const s = toDateTime("2026-02-09", "19:00");
      const e = shiftEndDateTime("2026-02-09", "19:00", 12);
      expect(state.hasOverlapWith("s1", s, e)).toBe(false);
    });
  });

  describe("clone", () => {
    it("creates an independent copy", () => {
      state.addAssignment(makeDraft({ staffId: "s1", shiftId: "sh1" }));
      const copy = state.clone();
      copy.addAssignment(makeDraft({ staffId: "s1", date: "2026-02-10", shiftId: "sh2" }));
      // Original should still have only 1 assignment
      expect(state.getStaffAssignments("s1")).toHaveLength(1);
      expect(copy.getStaffAssignments("s1")).toHaveLength(2);
    });
  });
});
