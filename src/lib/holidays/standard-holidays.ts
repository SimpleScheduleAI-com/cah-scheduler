/**
 * US standard holidays for the "Add Standard Holidays" button on
 * /settings/holidays.
 *
 * Floating holidays are computed per year from their rule (e.g. Thanksgiving =
 * fourth Thursday of November). An earlier version used fixed approximate days
 * ("Nov 28, 4th Thursday approx"), which put all five floating holidays on the
 * wrong date in 2026.
 *
 * Every result is a date-only YYYY-MM-DD string built with UTC arithmetic. Do
 * NOT build these with `new Date(year, month, day).toISOString()`: that is
 * LOCAL midnight converted to UTC, which is the previous calendar day in any
 * browser east of UTC (the founder's machine is UTC+5:30), so every holiday
 * landed one day early.
 */

export interface StandardHoliday {
  name: string;
  /** YYYY-MM-DD */
  date: string;
}

type HolidayRule =
  | { kind: "fixed"; month: number; day: number }
  /** nth (1-based) occurrence of `weekday` (0=Sun … 6=Sat) in `month`. */
  | { kind: "nth"; month: number; weekday: number; n: number }
  /** Last occurrence of `weekday` in `month`. */
  | { kind: "last"; month: number; weekday: number };

const MON = 1;
const THU = 4;

/** Months are 1-based (1 = January) throughout this module. */
const STANDARD_HOLIDAY_RULES: { name: string; rule: HolidayRule }[] = [
  { name: "New Year's Day", rule: { kind: "fixed", month: 1, day: 1 } },
  {
    name: "Martin Luther King Jr. Day",
    rule: { kind: "nth", month: 1, weekday: MON, n: 3 },
  },
  {
    name: "Presidents' Day",
    rule: { kind: "nth", month: 2, weekday: MON, n: 3 },
  },
  { name: "Memorial Day", rule: { kind: "last", month: 5, weekday: MON } },
  { name: "Independence Day", rule: { kind: "fixed", month: 7, day: 4 } },
  { name: "Labor Day", rule: { kind: "nth", month: 9, weekday: MON, n: 1 } },
  {
    name: "Thanksgiving",
    rule: { kind: "nth", month: 11, weekday: THU, n: 4 },
  },
  { name: "Christmas Eve", rule: { kind: "fixed", month: 12, day: 24 } },
  { name: "Christmas Day", rule: { kind: "fixed", month: 12, day: 25 } },
  { name: "New Year's Eve", rule: { kind: "fixed", month: 12, day: 31 } },
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Day of week (0=Sun … 6=Sat) of a calendar date, timezone-independent. */
function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Number of days in a month (month 1-based), timezone-independent. */
function daysInMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of this month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** YYYY-MM-DD of the nth (1-based) `weekday` in `month` of `year`. */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): string {
  const firstDow = dayOfWeek(year, month, 1);
  const firstMatch = 1 + ((weekday - firstDow + 7) % 7);
  const day = firstMatch + (n - 1) * 7;
  if (day > daysInMonth(year, month)) {
    throw new Error(
      `No occurrence ${n} of weekday ${weekday} in ${year}-${pad2(month)}`,
    );
  }
  return toDateString(year, month, day);
}

/** YYYY-MM-DD of the last `weekday` in `month` of `year`. */
export function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
): string {
  const lastDay = daysInMonth(year, month);
  const lastDow = dayOfWeek(year, month, lastDay);
  const day = lastDay - ((lastDow - weekday + 7) % 7);
  return toDateString(year, month, day);
}

function resolveRule(year: number, rule: HolidayRule): string {
  switch (rule.kind) {
    case "fixed":
      return toDateString(year, rule.month, rule.day);
    case "nth":
      return nthWeekdayOfMonth(year, rule.month, rule.weekday, rule.n);
    case "last":
      return lastWeekdayOfMonth(year, rule.month, rule.weekday);
  }
}

/**
 * The standard US holiday list for `year`, in calendar order, as date-only
 * YYYY-MM-DD strings. Fixed-date holidays stay on their date even when it
 * falls on a weekend (hospitals staff the actual day, not the observed one).
 */
export function getStandardHolidays(year: number): StandardHoliday[] {
  return STANDARD_HOLIDAY_RULES.map(({ name, rule }) => ({
    name,
    date: resolveRule(year, rule),
  }));
}

/**
 * Calendar year of a YYYY-MM-DD string, read from the string itself.
 * `new Date("2027-01-01").getFullYear()` is 2026 on any host west of UTC.
 */
export function yearOfDateString(dateStr: string): number {
  return parseInt(dateStr.slice(0, 4), 10);
}
