/**
 * "Add Standard Holidays" (/settings/holidays) — floating holidays must be
 * computed per year by rule, and every date must be the same YYYY-MM-DD in
 * every timezone.
 *
 * Regression (2026-10-15 review): the button used fixed approximate days
 * ("Thanksgiving Nov 28, 4th Thursday approx"), wrong for all five floating
 * holidays in 2026, and built dates with new Date(y, m, d).toISOString(),
 * which is a day early in any browser east of UTC (the founder is UTC+5:30).
 *
 * Expected dates are the published US federal-holiday calendar, independent
 * of the code under test (the 2026 list also matches src/db/seed-core.ts).
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  getStandardHolidays,
  nthWeekdayOfMonth,
  lastWeekdayOfMonth,
  yearOfDateString,
} from "@/lib/holidays/standard-holidays";

const EXPECTED_2026: Record<string, string> = {
  "New Year's Day": "2026-01-01",
  "Martin Luther King Jr. Day": "2026-01-19",
  "Presidents' Day": "2026-02-16",
  "Memorial Day": "2026-05-25",
  "Independence Day": "2026-07-04",
  "Labor Day": "2026-09-07",
  Thanksgiving: "2026-11-26",
  "Christmas Eve": "2026-12-24",
  "Christmas Day": "2026-12-25",
  "New Year's Eve": "2026-12-31",
};

const EXPECTED_2027: Record<string, string> = {
  "New Year's Day": "2027-01-01",
  "Martin Luther King Jr. Day": "2027-01-18",
  "Presidents' Day": "2027-02-15",
  "Memorial Day": "2027-05-31",
  "Independence Day": "2027-07-04",
  "Labor Day": "2027-09-06",
  Thanksgiving: "2027-11-25",
  "Christmas Eve": "2027-12-24",
  "Christmas Day": "2027-12-25",
  "New Year's Eve": "2027-12-31",
};

function asMap(year: number): Record<string, string> {
  return Object.fromEntries(
    getStandardHolidays(year).map((h) => [h.name, h.date]),
  );
}

function utcWeekday(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay();
}

describe("getStandardHolidays", () => {
  it("returns the correct date for every holiday in 2026", () => {
    expect(asMap(2026)).toEqual(EXPECTED_2026);
  });

  it("returns the correct date for every holiday in 2027", () => {
    expect(asMap(2027)).toEqual(EXPECTED_2027);
  });

  it("keeps the same ten holidays, in calendar order", () => {
    const list = getStandardHolidays(2026);
    expect(list.map((h) => h.name)).toEqual(Object.keys(EXPECTED_2026));
    const dates = list.map((h) => h.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("puts every floating holiday on its weekday, for a decade of years", () => {
    for (let year = 2024; year <= 2035; year++) {
      const m = asMap(year);
      for (const name of [
        "Martin Luther King Jr. Day",
        "Presidents' Day",
        "Memorial Day",
        "Labor Day",
      ]) {
        expect(utcWeekday(m[name]), `${name} ${year}`).toBe(1); // Monday
      }
      expect(utcWeekday(m.Thanksgiving), `Thanksgiving ${year}`).toBe(4);
      // Range checks pin WHICH Monday/Thursday it is.
      const day = (d: string) => Number(d.slice(8, 10));
      expect(day(m["Martin Luther King Jr. Day"])).toBeGreaterThanOrEqual(15);
      expect(day(m["Martin Luther King Jr. Day"])).toBeLessThanOrEqual(21);
      expect(day(m["Presidents' Day"])).toBeGreaterThanOrEqual(15);
      expect(day(m["Presidents' Day"])).toBeLessThanOrEqual(21);
      expect(day(m["Memorial Day"])).toBeGreaterThanOrEqual(25);
      expect(day(m["Labor Day"])).toBeLessThanOrEqual(7);
      expect(day(m.Thanksgiving)).toBeGreaterThanOrEqual(22);
      expect(day(m.Thanksgiving)).toBeLessThanOrEqual(28);
    }
  });
});

describe("weekday helpers", () => {
  it("nthWeekdayOfMonth handles a month that starts on the target weekday", () => {
    // Feb 1, 2027 is a Monday.
    expect(nthWeekdayOfMonth(2027, 2, 1, 1)).toBe("2027-02-01");
    expect(nthWeekdayOfMonth(2027, 2, 1, 3)).toBe("2027-02-15");
  });

  it("lastWeekdayOfMonth handles a month that ends on the target weekday", () => {
    // May 31, 2027 is a Monday.
    expect(lastWeekdayOfMonth(2027, 5, 1)).toBe("2027-05-31");
  });

  it("throws rather than spilling into the next month", () => {
    expect(() => nthWeekdayOfMonth(2026, 2, 1, 5)).toThrow();
  });

  it("yearOfDateString reads the year from the string", () => {
    expect(yearOfDateString("2027-01-01")).toBe(2027);
    expect(yearOfDateString("2026-12-31")).toBe(2026);
  });
});

describe("timezone safety", () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it("the old construction really is a day early under TZ=Asia/Kolkata (guards this test)", () => {
    process.env.TZ = "Asia/Kolkata";
    // If this fails, the runtime ignored the TZ change and the test below
    // would prove nothing.
    expect(new Date(2026, 0, 1).toISOString().slice(0, 10)).toBe("2025-12-31");
  });

  for (const tz of [
    "Asia/Kolkata",
    "America/Chicago",
    "Pacific/Kiritimati",
    "Pacific/Pago_Pago",
    "UTC",
  ]) {
    it(`returns identical dates under TZ=${tz}`, () => {
      process.env.TZ = tz;
      expect(asMap(2026)).toEqual(EXPECTED_2026);
      expect(asMap(2027)).toEqual(EXPECTED_2027);
      expect(yearOfDateString("2027-01-01")).toBe(2027);
    });
  }
});
