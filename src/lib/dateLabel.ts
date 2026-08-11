import { APP_TZ } from "@/lib/time";

// Client-safe formatting for the date shown on top of a scouted card.
// No server deps — safe to import into client components.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an ISO value. Date-only strings are anchored at noon UTC so formatting
 *  in the app timezone renders the intended calendar day (not the day before). */
function toDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const s = String(iso).trim();
  const t = DATE_ONLY.test(s) ? Date.parse(`${s}T12:00:00Z`) : Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

/** True when an ISO value carries a real clock time (not a bare calendar day). */
function hasClockTime(iso?: string | null): boolean {
  if (!iso) return false;
  const s = String(iso).trim();
  return !DATE_ONLY.test(s) && /T\d{2}:\d{2}/.test(s);
}

/**
 * A human date for a card: "Mon, Aug 11 · 8:00 PM" when a start time is known,
 * "Tue, Aug 12" for a day, or a range "Aug 8 – 11" / "Aug 30 – Sep 2". Returns
 * "" when there is no usable date.
 */
export function eventDateLabel(startISO?: string | null, endISO?: string | null): string {
  const s = toDate(startISO);
  const e = toDate(endISO);

  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: APP_TZ });
  const full = (d: Date) =>
    d.toLocaleDateString("en-US", {
      timeZone: APP_TZ,
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const monthShort = (d: Date) => d.toLocaleDateString("en-US", { timeZone: APP_TZ, month: "short" });
  const dayNum = (d: Date) => d.toLocaleDateString("en-US", { timeZone: APP_TZ, day: "numeric" });
  const monthDay = (d: Date) =>
    d.toLocaleDateString("en-US", { timeZone: APP_TZ, month: "short", day: "numeric" });
  const clock = (d: Date) =>
    d.toLocaleTimeString("en-US", { timeZone: APP_TZ, hour: "numeric", minute: "2-digit" });

  // A multi-day span reads as a date range (no clock time).
  if (s && e && day(s) !== day(e)) {
    const end = monthShort(s) === monthShort(e) ? dayNum(e) : monthDay(e);
    return `${monthDay(s)} – ${end}`;
  }

  // Single day: append the start time when the source gave one.
  const one = s ?? e;
  if (!one) return "";
  const oneIso = s ? startISO : endISO;
  return hasClockTime(oneIso) ? `${full(one)} · ${clock(one)}` : full(one);
}
