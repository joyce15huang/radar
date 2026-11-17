// Itinerary plans: pure helpers, safe on client and server.

export interface ItinItem {
  /** "HH:MM" (24h) or null when no time was typed. */
  time: string | null;
  title: string;
  place: string | null;
}
export interface ItinDay {
  items: ItinItem[];
}
/** One trip as the calendar sees it: start day (YYYY-MM-DD) + its days. */
export interface Trip {
  eventId: string;
  title: string;
  start: string;
  days: ItinDay[];
}

export const MAX_DAYS = 14;
export const MAX_ITEMS = 20;

const clip = (v: unknown, n: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "";

/** Validate whatever came in (form or database): known shape, short text, sane counts. */
export function cleanItinerary(raw: unknown): ItinDay[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_DAYS).map((d) => {
    const items = Array.isArray((d as ItinDay | null)?.items) ? (d as ItinDay).items : [];
    return {
      items: items
        .slice(0, MAX_ITEMS)
        .map((it) => {
          const time = typeof it?.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(it.time) ? it.time : null;
          return { time, title: clip(it?.title, 80), place: clip(it?.place, 80) || null };
        })
        .filter((it) => it.title)
        .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99")),
    };
  });
}

export function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
}

/** YYYY-MM-DD plus n days (calendar math, no time zones involved). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

const fmt = (ymd: string, o: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o }).format(new Date(Date.UTC(y, m - 1, d, 12)));
};

/** "Fri, Dec 4" */
export function dayLabel(ymd: string): string {
  return fmt(ymd, { weekday: "short", month: "short", day: "numeric" });
}

/** "Fri, Dec 4 – Sun, Dec 6" (or one day). */
export function tripLabel(start: string, days: number): string {
  if (days <= 1) return dayLabel(start);
  return `${dayLabel(start)} – ${dayLabel(addDays(start, days - 1))}`;
}

/** "17:30" → "5:30 PM" */
export function timeLabel(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
