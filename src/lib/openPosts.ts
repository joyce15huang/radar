// Open plans: pure helpers, client-safe.

export type Audience = "friends" | "fof" | "nearby";
export const AUDIENCES: { key: Audience; label: string }[] = [
  { key: "friends", label: "Friends" },
  { key: "fof", label: "Friends and their friends" },
  { key: "nearby", label: "Anyone nearby" },
];

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  /** "You", "Friend", "Friend of marcus", "Nearby" */
  relation: string;
  /** Short neighborhood, if the poster gave one. */
  place: string | null;
  ago: string;
  body: string;
  when: string;
  saves: number;
  savedByMe: boolean;
  mine: boolean;
  plan: { eventId: string; title: string; day: string; mon: string; sub: string } | null;
}

/** A short title for the calendar / a plan: the first line, trimmed to ~60 characters. */
export function titleFromBody(body: string): string {
  const line = body.split("\n").find((l) => l.trim())?.trim() ?? "";
  return line.length <= 60 ? line : `${line.slice(0, 59).trimEnd()}…`;
}

const ymd = (ms: number, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** "Tonight, 7 PM" · "Tomorrow" · "Sat, Nov 22, 9 AM" */
export function whenLabel(iso: string | null, hasTime: boolean, tz: string, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const day = ymd(t, tz);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date(t)));
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })
    .format(new Date(t))
    .replace(":00", "");
  let date: string;
  if (day === ymd(now, tz)) date = hasTime && hour >= 17 ? "Tonight" : "Today";
  else if (day === ymd(now + 86_400_000, tz)) date = "Tomorrow";
  else date = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(new Date(t));
  return hasTime ? `${date}, ${time}` : date;
}

/** "20m", "3h", "2d" */
export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/** Saturday or Sunday within the next 7 days (counting today). */
export function isThisWeekend(iso: string | null, tz: string, now = Date.now()): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t - now > 7 * 86_400_000) return false;
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(t));
  return wd === "Sat" || wd === "Sun";
}
