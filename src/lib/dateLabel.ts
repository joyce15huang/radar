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

/**
 * A human date for a card: "Tue, Aug 12", or a range "Aug 8 – 11" /
 * "Aug 30 – Sep 2". Returns "" when there is no usable date.
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

  if (s && e && day(s) !== day(e)) {
    const end = monthShort(s) === monthShort(e) ? dayNum(e) : monthDay(e);
    return `${monthDay(s)} – ${end}`;
  }
  const one = s ?? e;
  return one ? full(one) : "";
}
