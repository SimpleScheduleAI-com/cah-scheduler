/**
 * Cross-schedule-boundary tests for max-consecutive and rest-hours.
 *
 * Every schedule period starts from a blank slate, so a nurse who worked
 * Thu+Fri at the end of the prior period could be scheduled Mon–Sat of the
 * new period — 7 straight days the system never flags. The evaluators must
 * consume `context.priorAssignments` (the 7 days before scheduleStartDate)
 * and detect runs/gaps that span the boundary, while never emitting
 * violations for purely-prior-period patterns.
 */

import { describe, it, expect } from "vitest";
import { maxConsecutiveRule } from "@/lib/engine/rules/max-consecutive";
import { restHoursRule } from "@/lib/engine/rules/rest-hours";
import { makeContext, makeAssignment, makeStaff, makeShift } from "../helpers/context";
import type { PriorAssignmentInfo } from "@/lib/engine/rules/types";

const staff = makeStaff({ id: "staff-1" });
const staffMap = new Map([["staff-1", staff]]);

function prior(date: string, startTime = "07:00", endTime = "19:00"): PriorAssignmentInfo {
  return {
    staffId: "staff-1",
    date,
    startTime,
    endTime,
    durationHours: 12,
    shiftType: "day",
    unit: "ICU",
  };
}

// Schedule period starts 2026-03-02 (a Monday).
const START = "2026-03-02";

describe("max-consecutive — prior-schedule boundary", () => {
  it("flags a run that spans the schedule boundary", () => {
    // Prior period: worked Feb 26 – Mar 1 (4 days). New schedule: Mar 2 + Mar 3.
    // Total run Feb 26 → Mar 3 = 6 consecutive days.
    const shifts = [
      makeShift({ id: "s-0302", date: "2026-03-02" }),
      makeShift({ id: "s-0303", date: "2026-03-03" }),
    ];
    const ctx = makeContext({
      assignments: [
        makeAssignment({ id: "a1", shiftId: "s-0302", staffId: "staff-1", date: "2026-03-02" }),
        makeAssignment({ id: "a2", shiftId: "s-0303", staffId: "staff-1", date: "2026-03-03" }),
      ],
      shiftMap: new Map(shifts.map((s) => [s.id, s])),
      staffMap,
      scheduleStartDate: START,
      priorAssignments: [
        prior("2026-02-26"),
        prior("2026-02-27"),
        prior("2026-02-28"),
        prior("2026-03-01"),
      ],
    });
    const violations = maxConsecutiveRule.evaluate(ctx);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].staffId).toBe("staff-1");
  });

  it("does not flag when the prior run is broken before the boundary", () => {
    // Prior: Feb 26–27 then a day off. New: Mar 2–3. Longest run = 2.
    const shifts = [
      makeShift({ id: "s-0302", date: "2026-03-02" }),
      makeShift({ id: "s-0303", date: "2026-03-03" }),
    ];
    const ctx = makeContext({
      assignments: [
        makeAssignment({ id: "a1", shiftId: "s-0302", staffId: "staff-1", date: "2026-03-02" }),
        makeAssignment({ id: "a2", shiftId: "s-0303", staffId: "staff-1", date: "2026-03-03" }),
      ],
      shiftMap: new Map(shifts.map((s) => [s.id, s])),
      staffMap,
      scheduleStartDate: START,
      priorAssignments: [prior("2026-02-26"), prior("2026-02-27")],
    });
    expect(maxConsecutiveRule.evaluate(ctx)).toHaveLength(0);
  });

  it("does not emit violations for runs entirely inside the prior period", () => {
    // 6-day prior run, but the nurse works NOTHING in the new schedule.
    // That was the previous schedule's problem — don't re-flag it here.
    const ctx = makeContext({
      assignments: [],
      shiftMap: new Map(),
      staffMap,
      scheduleStartDate: START,
      priorAssignments: [
        prior("2026-02-24"),
        prior("2026-02-25"),
        prior("2026-02-26"),
        prior("2026-02-27"),
        prior("2026-02-28"),
        prior("2026-03-01"),
      ],
    });
    expect(maxConsecutiveRule.evaluate(ctx)).toHaveLength(0);
  });
});

describe("rest-hours — prior-schedule boundary", () => {
  it("flags insufficient rest between the prior period's last shift and the new period's first", () => {
    // Prior shift ends 22:00 on Mar 1; new shift starts 07:00 on Mar 2 → 9h rest.
    const s = makeShift({ id: "s-0302", date: "2026-03-02", startTime: "07:00", endTime: "19:00" });
    const ctx = makeContext({
      assignments: [
        makeAssignment({
          id: "a1",
          shiftId: "s-0302",
          staffId: "staff-1",
          date: "2026-03-02",
          startTime: "07:00",
          endTime: "19:00",
        }),
      ],
      shiftMap: new Map([[s.id, s]]),
      staffMap,
      scheduleStartDate: START,
      priorAssignments: [prior("2026-03-01", "10:00", "22:00")],
    });
    const violations = restHoursRule.evaluate(ctx);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].shiftId).toBe("s-0302");
  });

  it("passes when the boundary gap is sufficient", () => {
    // Prior shift ends 19:00 Mar 1; new shift starts 07:00 Mar 2 → 12h rest.
    const s = makeShift({ id: "s-0302", date: "2026-03-02", startTime: "07:00", endTime: "19:00" });
    const ctx = makeContext({
      assignments: [
        makeAssignment({
          id: "a1",
          shiftId: "s-0302",
          staffId: "staff-1",
          date: "2026-03-02",
          startTime: "07:00",
          endTime: "19:00",
        }),
      ],
      shiftMap: new Map([[s.id, s]]),
      staffMap,
      scheduleStartDate: START,
      priorAssignments: [prior("2026-03-01", "07:00", "19:00")],
    });
    expect(restHoursRule.evaluate(ctx)).toHaveLength(0);
  });

  it("does not emit violations for gaps entirely inside the prior period", () => {
    const ctx = makeContext({
      assignments: [],
      shiftMap: new Map(),
      staffMap,
      scheduleStartDate: START,
      priorAssignments: [prior("2026-03-01", "07:00", "19:00"), prior("2026-03-01", "20:00", "23:00")],
    });
    expect(restHoursRule.evaluate(ctx)).toHaveLength(0);
  });
});
