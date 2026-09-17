/**
 * Site-timezone date helpers. All wall-clock values entered by admins/sellers (date, datetime-local inputs,
 * period filters, "today") are interpreted in the site timezone, regardless of the server's TZ.
 */
export const SITE_TZ = process.env.NEXT_PUBLIC_TIMEZONE || process.env.REPORT_TIMEZONE || "Asia/Manila";

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const fmt = (tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Wall-clock parts of an instant in the given timezone. */
export function zonedParts(date: Date, tz = SITE_TZ): Parts {
  const parts = fmt(tz).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

function offsetMs(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instant for the given wall-clock time in the timezone. */
export function fromZoned(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0, tz = SITE_TZ): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const first = guess - offsetMs(new Date(guess), tz);
  const second = guess - offsetMs(new Date(first), tz);
  return new Date(second);
}

/** Parses "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm[:ss]" (date / datetime-local input values) as site-timezone wall time. Returns null when invalid. */
export function parseZonedInput(value: string | null | undefined, opts: { endOfDay?: boolean } = {}): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d, h, mi, s] = m;
  const hasTime = h !== undefined;
  const date = hasTime
    ? fromZoned(+y, +mo, +d, +h, +mi, s ? +s : 0)
    : opts.endOfDay
      ? fromZoned(+y, +mo, +d, 23, 59, 59, 999)
      : fromZoned(+y, +mo, +d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Start of the site-timezone day containing `date` (default: now). */
export function startOfZonedDay(date = new Date(), tz = SITE_TZ) {
  const p = zonedParts(date, tz);
  return fromZoned(p.year, p.month, p.day, 0, 0, 0, 0, tz);
}

/** Same wall-clock time `days` later (or earlier) in the timezone — a calendar step, not a fixed 24 hours. */
export function addZonedDays(date: Date, days: number, tz = SITE_TZ) {
  const p = zonedParts(date, tz);
  return fromZoned(p.year, p.month, p.day + days, p.hour, p.minute, p.second, 0, tz);
}

/** Start of the site-timezone day `n` calendar days before today. */
export function startOfZonedDaysAgo(n: number, tz = SITE_TZ) {
  const p = zonedParts(new Date(), tz);
  return fromZoned(p.year, p.month, p.day - n, 0, 0, 0, 0, tz);
}

/** "YYYY-MM-DD" for the instant in the site timezone. */
export function zonedDateKey(date = new Date(), tz = SITE_TZ) {
  const p = zonedParts(date, tz);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Date → value for <input type="datetime-local">, rendered in the site timezone. */
export function toZonedInput(d: Date | null | undefined, tz = SITE_TZ) {
  if (!d) return "";
  const p = zonedParts(d, tz);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
