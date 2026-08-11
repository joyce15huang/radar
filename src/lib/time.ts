// Client-safe time helpers (pure Intl/Date — safe to import anywhere, including
// client components). The app operates in a single timezone for now; per-user
// timezones are a future enhancement (the schedule parser has the same hardcode).

export const APP_TZ = "America/Los_Angeles";

/** How long a dateless "evergreen" gem stays before it ages out of the deck. */
export const SHELF_LIFE_DAYS = 3;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * YYYY-MM-DD for an ISO string in the app timezone; "" if unparseable.
 * A date-only value ("2026-08-12") is already a calendar day and is returned
 * as-is — parsing it as an instant would land on UTC midnight, i.e. the evening
 * before in the Americas, shifting the day back by one.
 */
export function ymd(iso: string | null | undefined, tz: string = APP_TZ): string {
  if (!iso) return "";
  const s = String(iso).trim();
  if (DATE_ONLY.test(s)) return s;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("en-CA", { timeZone: tz });
}

/** Add n days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDays(ymdStr: string, n: number): string {
  const d = new Date(`${ymdStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Offset (ms) between UTC and `tz` at instant `atMs`. The double toLocaleString
 * parse cancels the runtime's own timezone, so the result is correct regardless
 * of what timezone the server runs in.
 */
export function tzOffsetMs(atMs: number, tz: string = APP_TZ): number {
  const d = new Date(atMs);
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const zoned = new Date(d.toLocaleString("en-US", { timeZone: tz })).getTime();
  return utc - zoned;
}

/** UTC instant (ISO) of local midnight for a YYYY-MM-DD in the app timezone. */
export function localMidnightISO(ymdStr: string, tz: string = APP_TZ): string {
  const wall = Date.parse(`${ymdStr}T00:00:00Z`);
  return new Date(wall + tzOffsetMs(wall, tz)).toISOString();
}

/**
 * UTC instant (ISO) of the start of "today" in the app timezone. Anything whose
 * prune boundary is at or before this is a past item.
 */
export function startOfTodayISO(tz: string = APP_TZ, now: number = Date.now()): string {
  return localMidnightISO(ymd(new Date(now).toISOString(), tz), tz);
}
