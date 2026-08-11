// Deterministic conversions between a local wall-clock (calendar day + optional
// time) and an ISO instant, in a given IANA timezone (DST-aware). Pure and
// client+server safe. This is the single source of truth for event dates so the
// human label and the date chip can never disagree.

/** Minutes east of UTC for the given instant, in tz. */
function tzOffsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return Math.round((asUTC - utcMs) / 60000);
}

/** The viewer's IANA timezone (browser). Safe fallback for SSR. */
export function clientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  } catch {
    return "America/Los_Angeles";
  }
}

/**
 * Build the ISO instant for a local wall time in tz.
 * `date` = "YYYY-MM-DD"; `time` = "HH:MM" or null (→ 09:00 all-day sentinel).
 */
export function isoFromLocal(date: string, time: string | null, tz: string): string | null {
  const [y, mo, d] = date.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const [hh, mm] = (time ?? "09:00").split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, hh || 0, mm || 0);
  // Two passes so DST transition days resolve correctly.
  let utc = wall - tzOffsetMinutes(wall, tz) * 60000;
  utc = wall - tzOffsetMinutes(utc, tz) * 60000;
  return new Date(utc).toISOString();
}

/** Split an ISO instant into local { date, time } fields in tz, for a picker. */
export function localFromIso(
  iso: string,
  tz: string,
): { date: string; time: string } | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return { date, time };
}

/**
 * The canonical human label for an event, formatted from the machine ISO in tz.
 * "Mon, Aug 10 · 7:00 PM" (time only when hasTime). Because both this and the
 * date chip read the same ISO in the same tz, they always agree.
 */
export function formatWhen(iso: string | null | undefined, tz: string, hasTime: boolean): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
  if (!hasTime) return datePart;
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
  return `${datePart} · ${timePart}`;
}

/** Weekday name for a bare "YYYY-MM-DD" calendar day (tz-independent). */
export function weekdayOf(date: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  if (!y || !mo || !d) return "";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, mo - 1, d, 12)),
  );
}

/** True when a stored human label carries a time (has a "·" separator/clock). */
export function labelHasTime(label: string): boolean {
  return /·/.test(label) || /\d{1,2}:\d{2}/.test(label) || /\b\d{1,2}\s?(am|pm)\b/i.test(label);
}
