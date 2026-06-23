/**
 * Tests for the single canonical week utility (src/lib/date/week.ts).
 *
 * Every "what week is this" / "is this a weekend" computation in the app must
 * route through this module so the Mon–Sun, UTC-safe convention cannot drift
 * (a Sunday-based copy in the callout flow once undercounted weekly hours, and
 * a local-time copy in overtime-v2 silently mis-bucketed shifts west of UTC).
 *
 * These assertions are timezone-independent: they must hold on any host TZ.
 */

import { describe, it, expect } from "vitest";
import {
  addDays,
  utcDayOfWeek,
  getWeekStart,
  getWeekEnd,
  weekBounds,
  isWeekend,
  getWeekendId,
} from "@/lib/date/week";

describe("getWeekStart — Monday-based, UTC-safe", () => {
  it("maps a Sunday to the Monday of the same week", () => {
    expect(getWeekStart("2026-03-08")).toBe("2026-03-02"); // Sun -> preceding Mon
  });
  it("maps a Monday to itself", () => {
    expect(getWeekStart("2026-03-02")).toBe("2026-03-02");
  });
  it("maps a Saturday to the preceding Monday", () => {
    expect(getWeekStart("2026-03-07")).toBe("2026-03-02");
  });
  it("is correct across the DST spring-forward boundary", () => {
    // US DST starts 2026-03-08; the following Monday is 2026-03-09
    expect(getWeekStart("2026-03-09")).toBe("2026-03-09");
    expect(getWeekStart("2026-03-14")).toBe("2026-03-09");
  });
});

describe("weekBounds — Mon–Sun inclusive window", () => {
  it("includes the trailing Sunday for a Friday date", () => {
    // Fri 2026-06-26 → Mon 06-22 … Sun 06-28 (the Sunday a Sun–Sat week dropped)
    expect(weekBounds("2026-06-26")).toEqual({ weekStart: "2026-06-22", weekEnd: "2026-06-28" });
  });
  it("keeps a Sunday in its own Mon–Sun week, not the next", () => {
    expect(weekBounds("2026-06-28")).toEqual({ weekStart: "2026-06-22", weekEnd: "2026-06-28" });
  });
  it("maps a Monday to itself as the week start", () => {
    expect(weekBounds("2026-06-22")).toEqual({ weekStart: "2026-06-22", weekEnd: "2026-06-28" });
  });
});

describe("getWeekEnd", () => {
  it("returns the Sunday six days after the Monday week start", () => {
    expect(getWeekEnd("2026-06-22")).toBe("2026-06-28");
  });
});

describe("utcDayOfWeek", () => {
  it("returns 0 for Sunday and 6 for Saturday, regardless of host TZ", () => {
    expect(utcDayOfWeek("2026-06-28")).toBe(0); // Sunday
    expect(utcDayOfWeek("2026-06-22")).toBe(1); // Monday
    expect(utcDayOfWeek("2026-06-27")).toBe(6); // Saturday
  });
});

describe("isWeekend", () => {
  it("is true for Saturday and Sunday, false otherwise", () => {
    expect(isWeekend("2026-06-27")).toBe(true); // Sat
    expect(isWeekend("2026-06-28")).toBe(true); // Sun
    expect(isWeekend("2026-06-26")).toBe(false); // Fri
    expect(isWeekend("2026-06-22")).toBe(false); // Mon
  });
});

describe("getWeekendId — Sat+Sun share one id anchored to Saturday", () => {
  it("anchors Sunday back to its Saturday", () => {
    expect(getWeekendId("2026-03-08")).toBe("2026-03-07"); // Sun -> Sat
    expect(getWeekendId("2026-03-07")).toBe("2026-03-07"); // Sat -> itself
  });
  it("gives Saturday and Sunday of one weekend the same id", () => {
    expect(getWeekendId("2026-03-07")).toBe(getWeekendId("2026-03-08"));
  });
});

describe("addDays — UTC arithmetic", () => {
  it("adds and subtracts days across month boundaries", () => {
    expect(addDays("2026-06-28", 1)).toBe("2026-06-29");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });
});
