// Shared shapes + pure helpers for Teams (rosters, seasons, game headcount).
// Server data lives in app/team-actions.ts; see migration 0043_teams.sql.

export type TeamRole = "captain" | "cocaptain" | "player" | "sub";
export type TeamEventKind = "game" | "practice";
/** A player's answer for one game. "none" = hasn't answered yet. */
export type TeamAnswer = "in" | "maybe" | "out" | "none";

export const NEEDS_0043 = "Run migration 0043_teams in Supabase to turn on Teams.";

/** Most events one season import (or weekly practice) may create. */
export const MAX_SEASON_EVENTS = 26;

export const canManage = (role: TeamRole | null | undefined): boolean =>
  role === "captain" || role === "cocaptain";

/** A roster entry. */
export interface TeamMember {
  id: string;
  name: string;
  username: string;
  role: TeamRole;
  duesPaid: boolean;
}

/** One person's answer on a team event. */
export interface TeamAnswerEntry {
  id: string;
  name: string;
  answer: TeamAnswer;
  isSub: boolean;
}

/** Headcount for one game or practice. */
export interface Headcount {
  in: number;
  maybe: number;
  out: number;
  none: number;
  /** null = the team has no minimum. */
  min: number | null;
}

export interface TeamEventSummary {
  id: string;
  title: string;
  when: string;
  startsAt: string | null;
  location: string | null;
  kind: TeamEventKind | null;
  opponent: string | null;
  homeAway: "home" | "away" | null;
  /** Date-only (no start time known). */
  allDay: boolean;
  headcount: Headcount;
  /** The viewer's own answer. */
  mine: TeamAnswer;
}

export interface TeamSummary {
  id: string;
  name: string;
  blurb: string | null;
  role: TeamRole;
  memberCount: number;
  next: TeamEventSummary | null;
}

export interface TeamDetail {
  id: string;
  name: string;
  blurb: string | null;
  minPlayers: number | null;
  duesCents: number | null;
  venmoId: string | null;
  myRole: TeamRole;
  members: TeamMember[];
  upcoming: TeamEventSummary[];
  /** The last few played, newest first (for their read-only threads). */
  recent: TeamEventSummary[];
  pastCount: number;
  /** Pinned notes board (0044). */
  notes: string | null;
  notesUpdatedAt: string | null;
  notesBy: string | null;
  /** Link out to the team's existing group chat. */
  chatUrl: string | null;
}

/** The answer a card's status + content stand for. */
export function answerOf(status: string, content: Record<string, unknown> | null | undefined): TeamAnswer {
  if (status === "accepted") return "in";
  if (status === "dismissed") return "out";
  if (status === "pending" && content?.maybe === "true") return "maybe";
  return "none";
}

/** Tally answers. Each person counts once. */
export function tally(answers: TeamAnswer[], min: number | null): Headcount {
  const h: Headcount = { in: 0, maybe: 0, out: 0, none: 0, min };
  for (const a of answers) h[a] += 1;
  return h;
}

/** How many more players a game needs (0 when it has enough or no minimum). */
export function shortBy(h: Headcount): number {
  if (h.min === null) return 0;
  return Math.max(0, h.min - h.in);
}

/**
 * Weekly repeats of one start time: `first` plus every 7 days through `untilYmd`
 * (inclusive, compared on the UTC calendar day of each ISO), capped at `max`.
 * Keeps the wall-clock time across DST by re-anchoring each date in `tz`.
 */
export function weeklyStarts(
  firstIso: string,
  untilYmd: string,
  tz: string,
  max = MAX_SEASON_EVENTS,
): string[] {
  const t0 = Date.parse(firstIso);
  if (Number.isNaN(t0) || !/^\d{4}-\d{2}-\d{2}$/.test(untilYmd)) return [];
  const local = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(ms));
    const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "00";
    return { ymd: `${get("year")}-${get("month")}-${get("day")}`, hm: `${get("hour")}:${get("minute")}` };
  };
  const { ymd: firstDay, hm } = local(t0);
  const [y, m, d] = firstDay.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    // Step the local calendar day by 7, then pin to the original local time (DST-safe).
    const day = new Date(Date.UTC(y, m - 1, d + i * 7)).toISOString().slice(0, 10);
    if (day > untilYmd) break;
    out.push(isoAt(day, hm, tz));
  }
  return out;
}

/** ISO with offset for a local date + "HH:MM" in tz. */
export function isoAt(ymd: string, hm: string, tz: string): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Offset of tz at (approximately) that instant, then correct once.
  const off = (ms: number) => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(ms));
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms;
  };
  let ms = asUtc - off(asUtc);
  ms = asUtc - off(ms);
  return new Date(ms).toISOString();
}

/** "$60" from cents. */
export function dollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** Title for a game row: "vs. X" at home, "at X" away, else the event title. */
export function gameTitle(e: { title: string; opponent: string | null; homeAway: "home" | "away" | null }): string {
  if (!e.opponent) return e.title;
  return `${e.homeAway === "away" ? "at" : "vs."} ${e.opponent}`;
}
