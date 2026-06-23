/**
 * The single source of truth for week math across the scheduler.
 *
 * Convention: weeks run MONDAY → SUNDAY and every computation is UTC-safe.
 *
 * All schedule dates are YYYY-MM-DD strings. JavaScript parses a bare date
 * string as UTC midnight, but local-time methods (getDay/getDate/setDate) then
 * operate in the server's timezone. On any host west of UTC (e.g. a Texas
 * hospital on America/Chicago) UTC midnight is the previous local evening, so
 * week starts land on the wrong Monday and Sat/Sun pairing breaks. Routing all
 * date-only arithmetic through parseUTC/addDays/utcDayOfWeek keeps the result
 * identical on every host. Do NOT reimplement any of this with `new Date(str)`
 * + getDay()/setDate() — that is the exact bug this module exists to prevent.
 */

/** Parse a YYYY-MM-DD string as UTC midnight. */
export function parseUTC(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}

/** Add `days` to a YYYY-MM-DD string, returning YYYY-MM-DD (UTC arithmetic). */
export function addDays(dateStr: string, days: number): string {
  const d = parseUTC(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Day of week for a YYYY-MM-DD string: 0=Sun … 6=Sat (timezone-independent). */
export function utcDayOfWeek(dateStr: string): number {
  return parseUTC(dateStr).getUTCDay();
}

/** Monday (YYYY-MM-DD) of the week containing `dateStr`. */
export function getWeekStart(dateStr: string): string {
  const day = utcDayOfWeek(dateStr); // 0=Sun, 1=Mon, …, 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // days to the preceding Monday
  return addDays(dateStr, diff);
}

/** Sunday (YYYY-MM-DD) of the week whose Monday is `weekStart`. */
export function getWeekEnd(weekStart: string): string {
  return addDays(weekStart, 6);
}

/** Mon–Sun inclusive bounds for the week containing `dateStr`. */
export function weekBounds(dateStr: string): { weekStart: string; weekEnd: string } {
  const weekStart = getWeekStart(dateStr);
  return { weekStart, weekEnd: getWeekEnd(weekStart) };
}

/** True if `dateStr` is a Saturday or Sunday. */
export function isWeekend(dateStr: string): boolean {
  const day = utcDayOfWeek(dateStr);
  return day === 0 || day === 6;
}

/**
 * Weekend identifier: the Saturday date of the weekend `dateStr` belongs to, so
 * a Saturday and its following Sunday share one id (one weekend rotation).
 */
export function getWeekendId(dateStr: string): string {
  // Anchor Sunday back to Saturday; a Saturday is its own id.
  return utcDayOfWeek(dateStr) === 0 ? addDays(dateStr, -1) : dateStr;
}
