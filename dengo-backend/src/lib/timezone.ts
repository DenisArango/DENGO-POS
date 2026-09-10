/**
 * Business day boundaries, independent of the server OS's local timezone.
 *
 * Guatemala (this app's only deployment today, see Branch.timezone default
 * "America/Guatemala") is fixed at UTC-6 with no DST, so a constant offset is
 * exact — no date-tz library needed. Using this instead of `new Date()` +
 * getFullYear/Month/Date (server-local time, undefined once hosted on a cloud
 * VM that isn't set to Guatemala time) or a raw `.toISOString()` slice (UTC,
 * off by up to 6h from the actual business day) keeps every "today"/"this
 * day" calculation across reports agreeing with each other regardless of
 * where the process runs.
 */
const BUSINESS_UTC_OFFSET_HOURS = -6

/** [startOfDay, endOfDay] in UTC instants that correspond to the business's local calendar day containing `at` (defaults to now). */
export function getBusinessDayBounds(at: Date = new Date()): { start: Date; end: Date } {
  const shifted = new Date(at.getTime() + BUSINESS_UTC_OFFSET_HOURS * 3_600_000)
  const y = shifted.getUTCFullYear(), m = shifted.getUTCMonth(), d = shifted.getUTCDate()
  const start = new Date(Date.UTC(y, m, d) - BUSINESS_UTC_OFFSET_HOURS * 3_600_000)
  const end = new Date(start.getTime() + 24 * 3_600_000 - 1)
  return { start, end }
}

/** The business's local calendar date (YYYY-MM-DD) for a given instant — use instead of `date.toISOString().slice(0,10)` when grouping sales by day. */
export function toBusinessDateKey(at: Date): string {
  const shifted = new Date(at.getTime() + BUSINESS_UTC_OFFSET_HOURS * 3_600_000)
  return shifted.toISOString().slice(0, 10)
}

/** The business's local hour-of-day (0-23) for a given instant — use instead of `date.getHours()` (server-local time) when bucketing sales by hour. */
export function getBusinessHour(at: Date): number {
  const shifted = new Date(at.getTime() + BUSINESS_UTC_OFFSET_HOURS * 3_600_000)
  return shifted.getUTCHours()
}

/** The business's local minutes-since-midnight (0-1439) for a given instant — used to compare against an "HH:mm" role login-schedule window. */
export function getBusinessTimeMinutes(at: Date = new Date()): number {
  const shifted = new Date(at.getTime() + BUSINESS_UTC_OFFSET_HOURS * 3_600_000)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

/** [startOfMonth, endOfMonth] in UTC instants for the business's local calendar month (`month` is 1-12). Used by sales goals to sum a month's sales the same way `getBusinessDayBounds` sums a day's. */
export function getBusinessMonthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1) - BUSINESS_UTC_OFFSET_HOURS * 3_600_000)
  const end = new Date(Date.UTC(year, month, 1) - BUSINESS_UTC_OFFSET_HOURS * 3_600_000 - 1)
  return { start, end }
}

/** The business's current local year and month (1-12) — the default period for a sales goal when none is specified. */
export function getCurrentBusinessYearMonth(at: Date = new Date()): { year: number; month: number } {
  const shifted = new Date(at.getTime() + BUSINESS_UTC_OFFSET_HOURS * 3_600_000)
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 }
}
