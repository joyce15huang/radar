"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { serverTimeZone } from "@/lib/tz";
import { formatWhen } from "@/lib/localDateTime";
import { applyRsvp, promoteFromWaitlist } from "@/lib/capacity";
import { normalizeUsername } from "@/lib/username";
import { friendIdSet } from "@/lib/friendIds";
import { guardedParse } from "@/lib/parse/guarded";
import type { ParsedEvent } from "@/lib/parse/schedule";
import {
  answerOf,
  canManage,
  gameTitle,
  tally,
  weeklyStarts,
  MAX_SEASON_EVENTS,
  NEEDS_0043,
  type Headcount,
  type TeamAnswer,
  type TeamAnswerEntry,
  type TeamDetail,
  type TeamEventKind,
  type TeamEventSummary,
  type TeamMember,
  type TeamRole,
  type TeamSummary,
} from "@/lib/teams";

type Admin = ReturnType<typeof createAdminClient>;
type Content = Record<string, string | null>;

export interface TeamResult {
  ok: boolean;
  error?: string;
  teamId?: string;
  count?: number;
}

interface TeamRow {
  id: string;
  owner_id: string;
  name: string;
  blurb: string | null;
  min_players: number | null;
  dues_cents: number | null;
  venmo_id: string | null;
  invite_code: string | null;
}
const TEAM_COLS = "id, owner_id, name, blurb, min_players, dues_cents, venmo_id, invite_code";

interface TeamEventRow {
  id: string;
  creator_id: string;
  title: string | null;
  event_time: string | null;
  starts_at: string | null;
  location: string | null;
  kind: TeamEventKind | null;
  opponent: string | null;
  home_away: "home" | "away" | null;
  all_day: boolean | null;
}
const EVENT_COLS = "id, creator_id, title, event_time, starts_at, location, kind, opponent, home_away, all_day";

/** A missing-table / missing-column error means 0043 hasn't run yet. */
const needsMigration = (msg: string | undefined) =>
  !!msg &&
  /teams|team_members|team_id|home_away|opponent|all_day|canceled_at|\bkind\b/i.test(msg) &&
  /exist|schema|column|relation/i.test(msg);
const fail = (msg: string | undefined, fallback: string): TeamResult => ({
  ok: false,
  error: needsMigration(msg) ? NEEDS_0043 : msg || fallback,
});

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || email
  );
}

/** id → { name, username } for a set of profiles. */
async function namesFor(admin: Admin, ids: string[]): Promise<Map<string, { name: string; username: string }>> {
  const out = new Map<string, { name: string; username: string }>();
  if (ids.length === 0) return out;
  const { data } = await admin.from("profiles").select("id, username, display_name, email").in("id", ids);
  for (const p of data ?? []) {
    const username = (p.username as string) || "";
    out.set(p.id as string, {
      name: (p.display_name as string) || username || nameFromEmail((p.email as string) || "Someone"),
      username,
    });
  }
  return out;
}

async function loadTeam(admin: Admin, teamId: string): Promise<TeamRow | null> {
  if (!teamId) return null;
  const { data, error } = await admin.from("teams").select(TEAM_COLS).eq("id", teamId).maybeSingle();
  if (error) return null;
  return (data as TeamRow | null) ?? null;
}

async function roleOf(admin: Admin, teamId: string, memberId: string): Promise<TeamRole | null> {
  const { data } = await admin
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("member_id", memberId)
    .maybeSingle();
  return ((data?.role as TeamRole | undefined) ?? null) as TeamRole | null;
}

/** Load the team + check the actor can run it. */
async function managed(teamId: string) {
  const actor = await getActor();
  if (!actor) return { error: "You're not signed in." } as const;
  const admin = createAdminClient();
  const team = await loadTeam(admin, teamId);
  if (!team) return { error: "That team doesn't exist (or Teams isn't set up yet)." } as const;
  const role = await roleOf(admin, teamId, actor.actorId);
  if (!canManage(role)) return { error: "Only the captains can do that." } as const;
  return { actor, admin, team, role } as const;
}

async function siteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** The denormalized card content every team event carries. */
function teamCardContent(ev: TeamEventRow, team: TeamRow, hostName: string, hostId: string): Content {
  const c: Content = {
    senderName: team.name,
    hostId,
    hostName,
    eventTime: ev.event_time ?? "",
    allowReinvite: "false",
    teamId: team.id,
    teamName: team.name,
  };
  if (ev.starts_at) c.startsAt = ev.starts_at;
  if (ev.location) c.location = ev.location;
  if (ev.kind) c.teamKind = ev.kind;
  if (ev.opponent) c.opponent = ev.opponent;
  if (ev.home_away) c.homeAway = ev.home_away;
  return c;
}

/**
 * Put team events on people's calendars: a pending invite card for each
 * (person, event) pair that doesn't already have one. `accepted` ids get an
 * accepted card instead (the captain who created them).
 */
async function fanOut(
  admin: Admin,
  team: TeamRow,
  events: TeamEventRow[],
  memberIds: string[],
  opts: { accepted?: string[]; extra?: Content } = {},
): Promise<number> {
  if (events.length === 0 || memberIds.length === 0) return 0;
  const eventIds = events.map((e) => e.id);
  const { data: existing } = await admin
    .from("cards")
    .select("event_id, user_id")
    .in("event_id", eventIds)
    .in("user_id", memberIds)
    .eq("type", "social_invite");
  const have = new Set((existing ?? []).map((r) => `${r.event_id}:${r.user_id}`));
  const hostIds = [...new Set(events.map((e) => e.creator_id))];
  const hosts = await namesFor(admin, hostIds);
  const accepted = new Set(opts.accepted ?? []);

  const rows = events.flatMap((ev) => {
    const hostName = hosts.get(ev.creator_id)?.name ?? team.name;
    const content = { ...teamCardContent(ev, team, hostName, ev.creator_id), ...(opts.extra ?? {}) };
    return memberIds
      .filter((uid) => !have.has(`${ev.id}:${uid}`))
      .map((uid) => ({
        user_id: uid,
        sender_id: ev.creator_id,
        type: "social_invite",
        title: ev.title ?? "Team event",
        content,
        status: accepted.has(uid) ? "accepted" : "pending",
        event_id: ev.id,
      }));
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("cards").insert(rows.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

/** Upcoming (not yet started, or undated) events for a team. */
async function upcomingEvents(admin: Admin, teamId: string): Promise<TeamEventRow[]> {
  const since = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const { data } = await admin
    .from("events")
    .select(EVENT_COLS)
    .eq("team_id", teamId)
    .is("canceled_at", null)
    .or(`starts_at.is.null,starts_at.gte.${since}`)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(60);
  return (data ?? []) as TeamEventRow[];
}

/** Non-sub roster ids (everyone who's invited to every game). */
async function playerIds(admin: Admin, teamId: string): Promise<string[]> {
  const { data } = await admin.from("team_members").select("member_id, role").eq("team_id", teamId);
  return (data ?? []).filter((r) => r.role !== "sub").map((r) => r.member_id as string);
}

/** Per-event answers from invite cards. Each person once; canceled events report nothing. */
async function answersFor(
  admin: Admin,
  eventIds: string[],
): Promise<Map<string, { userId: string; answer: TeamAnswer; isSub: boolean; cardId: string; waitlisted: boolean }[]>> {
  const out = new Map<string, { userId: string; answer: TeamAnswer; isSub: boolean; cardId: string; waitlisted: boolean }[]>();
  if (eventIds.length === 0) return out;
  const { data } = await admin
    .from("cards")
    .select("id, event_id, user_id, status, content")
    .in("event_id", eventIds)
    .eq("type", "social_invite");
  const seen = new Set<string>();
  for (const r of data ?? []) {
    const key = `${r.event_id}:${r.user_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = (r.content ?? {}) as Content;
    const arr = out.get(r.event_id as string) ?? [];
    arr.push({
      userId: r.user_id as string,
      answer: answerOf(r.status as string, c),
      isSub: c.sub === "true",
      cardId: r.id as string,
      waitlisted: !!c.waitlistedAt,
    });
    out.set(r.event_id as string, arr);
  }
  return out;
}

function summarize(
  ev: TeamEventRow,
  answers: { userId: string; answer: TeamAnswer }[],
  min: number | null,
  me: string,
): TeamEventSummary {
  const headcount = tally(
    answers.map((a) => a.answer),
    ev.kind === "practice" ? null : min,
  );
  return {
    id: ev.id,
    title: gameTitle({ title: ev.title ?? "Game", opponent: ev.opponent, homeAway: ev.home_away }),
    when: ev.event_time ?? "",
    startsAt: ev.starts_at,
    location: ev.location,
    kind: ev.kind,
    opponent: ev.opponent,
    homeAway: ev.home_away,
    allDay: !!ev.all_day,
    headcount,
    mine: answers.find((a) => a.userId === me)?.answer ?? "none",
  };
}

// ---------------------------------------------------------------------------
// Teams: create, list, read, edit
// ---------------------------------------------------------------------------

export async function createTeam(input: { name: string; blurb?: string; minPlayers?: number | null }): Promise<TeamResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false, error: "Name your team." };
  const min = input.minPlayers && input.minPlayers > 0 ? Math.min(99, Math.floor(input.minPlayers)) : null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("teams")
    .insert({ owner_id: actor.actorId, name, blurb: input.blurb?.trim().slice(0, 80) || null, min_players: min })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message, "Couldn't create the team.");
  const { error: mErr } = await admin
    .from("team_members")
    .insert({ team_id: data.id, member_id: actor.actorId, role: "captain" });
  if (mErr) return fail(mErr.message, "Couldn't add you to the team.");
  revalidatePath("/teams");
  return { ok: true, teamId: data.id as string };
}

/** Teams the actor is on, each with its next event. Empty before 0043. */
export async function listMyTeams(): Promise<TeamSummary[]> {
  const actor = await getActor();
  if (!actor) return [];
  const admin = createAdminClient();
  const { data: mine, error } = await admin
    .from("team_members")
    .select("team_id, role")
    .eq("member_id", actor.actorId);
  if (error || !mine?.length) return [];
  const ids = mine.map((m) => m.team_id as string);
  const roleById = new Map(mine.map((m) => [m.team_id as string, m.role as TeamRole]));
  const [{ data: teams }, { data: members }] = await Promise.all([
    admin.from("teams").select(TEAM_COLS).in("id", ids),
    admin.from("team_members").select("team_id").in("team_id", ids),
  ]);
  const counts = new Map<string, number>();
  for (const m of members ?? []) counts.set(m.team_id as string, (counts.get(m.team_id as string) ?? 0) + 1);

  const out: TeamSummary[] = [];
  for (const t of (teams ?? []) as TeamRow[]) {
    const next = (await upcomingEvents(admin, t.id))[0] ?? null;
    let nextSummary: TeamEventSummary | null = null;
    if (next) {
      const answers = (await answersFor(admin, [next.id])).get(next.id) ?? [];
      nextSummary = summarize(next, answers, t.min_players, actor.actorId);
    }
    out.push({
      id: t.id,
      name: t.name,
      blurb: t.blurb,
      role: roleById.get(t.id) ?? "player",
      memberCount: counts.get(t.id) ?? 0,
      next: nextSummary,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Everything the team page shows. Members only; null otherwise. */
export async function getTeam(teamId: string): Promise<TeamDetail | null> {
  const actor = await getActor();
  if (!actor) return null;
  const admin = createAdminClient();
  const team = await loadTeam(admin, teamId);
  if (!team) return null;
  const myRole = await roleOf(admin, teamId, actor.actorId);
  if (!myRole) return null;

  const { data: memberRows } = await admin
    .from("team_members")
    .select("member_id, role, dues_paid, joined_at")
    .eq("team_id", teamId)
    .order("joined_at", { ascending: true });
  const names = await namesFor(
    admin,
    (memberRows ?? []).map((m) => m.member_id as string),
  );
  const order: Record<TeamRole, number> = { captain: 0, cocaptain: 1, player: 2, sub: 3 };
  const members: TeamMember[] = (memberRows ?? [])
    .map((m) => ({
      id: m.member_id as string,
      name: names.get(m.member_id as string)?.name ?? "Someone",
      username: names.get(m.member_id as string)?.username ?? "",
      role: m.role as TeamRole,
      duesPaid: !!m.dues_paid,
    }))
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));

  const events = await upcomingEvents(admin, teamId);
  const answers = await answersFor(
    admin,
    events.map((e) => e.id),
  );
  const upcoming = events.map((e) => summarize(e, answers.get(e.id) ?? [], team.min_players, actor.actorId));

  const pastCut = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const [{ count: pastCount }, { data: pastRows }, board] = await Promise.all([
    admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .is("canceled_at", null)
      .lt("starts_at", pastCut),
    admin
      .from("events")
      .select(EVENT_COLS)
      .eq("team_id", teamId)
      .is("canceled_at", null)
      .lt("starts_at", pastCut)
      .order("starts_at", { ascending: false })
      .limit(3),
    // Notes board + chat link (0044; absent before it runs).
    admin.from("teams").select("notes, notes_updated_at, notes_by, chat_url").eq("id", teamId).maybeSingle(),
  ]);
  const past = (pastRows ?? []) as TeamEventRow[];
  const pastAnswers = await answersFor(
    admin,
    past.map((e) => e.id),
  );
  const recent = past.map((e) => summarize(e, pastAnswers.get(e.id) ?? [], team.min_players, actor.actorId));
  const b = (board.error ? null : board.data) as
    | { notes: string | null; notes_updated_at: string | null; notes_by: string | null; chat_url: string | null }
    | null;
  const notesBy = b?.notes_by ? ((await namesFor(admin, [b.notes_by])).get(b.notes_by)?.name ?? null) : null;

  return {
    id: team.id,
    name: team.name,
    blurb: team.blurb,
    minPlayers: team.min_players,
    duesCents: team.dues_cents,
    venmoId: team.venmo_id,
    myRole,
    members,
    upcoming,
    recent,
    pastCount: pastCount ?? 0,
    notes: b?.notes ?? null,
    notesUpdatedAt: b?.notes_updated_at ?? null,
    notesBy,
    chatUrl: b?.chat_url ?? null,
  };
}

export async function updateTeam(
  teamId: string,
  input: { name: string; blurb?: string; minPlayers?: number | null; duesCents?: number | null; venmoId?: string },
): Promise<TeamResult> {
  const m = await managed(teamId);
  if ("error" in m) return { ok: false, error: m.error };
  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false, error: "Name your team." };
  const min = input.minPlayers && input.minPlayers > 0 ? Math.min(99, Math.floor(input.minPlayers)) : null;
  const dues = input.duesCents && input.duesCents > 0 ? Math.round(input.duesCents) : null;
  const { error } = await m.admin
    .from("teams")
    .update({
      name,
      blurb: input.blurb?.trim().slice(0, 80) || null,
      min_players: min,
      dues_cents: dues,
      venmo_id: input.venmoId?.trim().replace(/^@/, "").slice(0, 40) || null,
    })
    .eq("id", teamId);
  if (error) return fail(error.message, "Couldn't save.");
  // (Cards keep the old name in content; Today and event pages read it live.)
  revalidatePath(`/team/${teamId}`);
  revalidatePath("/teams");
  return { ok: true, teamId };
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

const NOT_A_FRIEND =
  "You can add friends directly — for anyone else, share the team link so they can join themselves.";

/**
 * Add a FRIEND by @handle / email. Players get every upcoming event; subs don't.
 * Everyone else joins through the team link — so nobody can put a season of
 * games on a stranger's calendar.
 */
export async function addTeamMember(teamId: string, handle: string, role: "player" | "sub"): Promise<TeamResult> {
  const m = await managed(teamId);
  if ("error" in m) return { ok: false, error: m.error };
  const q = handle.trim().replace(/^@/, "");
  if (!q) return { ok: false, error: "Type their @handle." };
  const isEmail = q.includes("@");
  const { data: p } = await m.admin
    .from("profiles")
    .select("id")
    .eq(isEmail ? "email" : "username", isEmail ? q.toLowerCase() : normalizeUsername(q))
    .maybeSingle();
  // Same answer whether or not the account exists (no account probing).
  if (!p) return { ok: false, error: NOT_A_FRIEND };
  const memberId = p.id as string;
  const friends = await friendIdSet(m.admin, m.actor.actorId);
  if (!friends.has(memberId)) return { ok: false, error: NOT_A_FRIEND };

  const existing = await roleOf(m.admin, teamId, memberId);
  if (existing) return { ok: false, error: "They're already on the team." };
  const { error } = await m.admin.from("team_members").insert({ team_id: teamId, member_id: memberId, role });
  if (error) return fail(error.message, "Couldn't add them.");
  if (role !== "sub") await fanOut(m.admin, m.team, await upcomingEvents(m.admin, teamId), [memberId]);
  revalidatePath(`/team/${teamId}`);
  return { ok: true, teamId };
}

/** Change someone's role (captains only; the owner always stays captain). */
export async function setMemberRole(teamId: string, memberId: string, role: TeamRole): Promise<TeamResult> {
  const m = await managed(teamId);
  if ("error" in m) return { ok: false, error: m.error };
  if (memberId === m.team.owner_id && role !== "captain") return { ok: false, error: "The team's creator stays captain." };
  if (role === "captain" && m.role !== "captain") return { ok: false, error: "Only a captain can make captains." };
  const before = await roleOf(m.admin, teamId, memberId);
  if (!before) return { ok: false, error: "They're not on the team." };
  if (before === "captain" && m.role !== "captain") return { ok: false, error: "Only a captain can change a captain." };
  const { error } = await m.admin.from("team_members").update({ role }).eq("team_id", teamId).eq("member_id", memberId);
  if (error) return fail(error.message, "Couldn't change their role.");
  // A sub promoted to the roster gets every upcoming event.
  if (before === "sub" && role !== "sub") await fanOut(m.admin, m.team, await upcomingEvents(m.admin, teamId), [memberId]);
  revalidatePath(`/team/${teamId}`);
  return { ok: true, teamId };
}

/** Captains remove someone, or anyone leaves. Their unanswered upcoming invites go away. */
export async function removeTeamMember(teamId: string, memberId: string): Promise<TeamResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const team = await loadTeam(admin, teamId);
  if (!team) return { ok: false, error: "That team doesn't exist." };
  const self = memberId === actor.actorId;
  if (!self) {
    const myRole = await roleOf(admin, teamId, actor.actorId);
    if (!canManage(myRole)) return { ok: false, error: "Only the captains can do that." };
    if ((await roleOf(admin, teamId, memberId)) === "captain" && myRole !== "captain")
      return { ok: false, error: "Only a captain can remove a captain." };
  }
  if (memberId === team.owner_id) return { ok: false, error: "The team's creator can't leave — hand it off first." };

  await admin.from("team_members").delete().eq("team_id", teamId).eq("member_id", memberId);
  // Off every upcoming game (so they don't count as In or Out any more), nudges too.
  const ids = (await upcomingEvents(admin, teamId)).map((e) => e.id);
  if (ids.length) {
    await admin.from("cards").delete().in("event_id", ids).eq("user_id", memberId).in("type", ["social_invite", "event_update"]);
  }
  revalidatePath(`/team/${teamId}`);
  revalidatePath("/teams");
  if (self) redirect("/teams");
  return { ok: true, teamId };
}

/** Mark season dues paid — yourself, or anyone if you're a captain. No money moves. */
export async function setDuesPaid(teamId: string, memberId: string, paid: boolean): Promise<TeamResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const myRole = await roleOf(admin, teamId, actor.actorId);
  if (!myRole) return { ok: false, error: "You're not on this team." };
  if (memberId !== actor.actorId && !canManage(myRole)) return { ok: false, error: "Only the captains can do that." };
  const { error } = await admin
    .from("team_members")
    .update({ dues_paid: paid })
    .eq("team_id", teamId)
    .eq("member_id", memberId);
  if (error) return fail(error.message, "Couldn't save.");
  revalidatePath(`/team/${teamId}`);
  return { ok: true, teamId };
}

// ---------------------------------------------------------------------------
// Team link (/t/<code>) + calendar feed
// ---------------------------------------------------------------------------

async function ensureCode(admin: Admin, team: TeamRow): Promise<string | null> {
  let code = team.invite_code;
  for (let i = 0; !code && i < 4; i++) {
    const { data } = await admin
      .from("teams")
      .update({ invite_code: newCode() })
      .eq("id", team.id)
      .is("invite_code", null)
      .select("invite_code")
      .maybeSingle();
    code = (data?.invite_code as string | null) ?? null;
    if (!code) {
      const { data: again } = await admin.from("teams").select("invite_code").eq("id", team.id).maybeSingle();
      code = (again?.invite_code as string | null) ?? null;
    }
  }
  return code;
}

/** Join link + calendar-subscribe link. Any member may share them. */
export async function getTeamLinks(teamId: string): Promise<{ ok: boolean; join?: string; calendar?: string; error?: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const team = await loadTeam(admin, teamId);
  if (!team || !(await roleOf(admin, teamId, actor.actorId))) return { ok: false, error: "You're not on this team." };
  const code = await ensureCode(admin, team);
  if (!code) return { ok: false, error: "Couldn't make a link. Try again." };
  const origin = await siteOrigin();
  return { ok: true, join: `${origin}/t/${code}`, calendar: `${origin}/api/team-calendar/${code}` };
}

/** Public preview of a team link (no auth). */
export async function previewTeam(code: string): Promise<{ id: string; name: string; blurb: string | null; captain: string; players: number } | null> {
  if (!/^[A-Za-z0-9]{6,16}$/.test(code)) return null;
  const admin = createAdminClient();
  const { data: t, error } = await admin.from("teams").select("id, owner_id, name, blurb").eq("invite_code", code).maybeSingle();
  if (error || !t) return null;
  const [{ count }, names] = await Promise.all([
    admin.from("team_members").select("member_id", { count: "exact", head: true }).eq("team_id", t.id).neq("role", "sub"),
    namesFor(admin, [t.owner_id as string]),
  ]);
  return {
    id: t.id as string,
    name: t.name as string,
    blurb: (t.blurb as string | null) ?? null,
    captain: names.get(t.owner_id as string)?.name ?? "the captain",
    players: count ?? 0,
  };
}

/** Join from a team link — as a player (every game) or a sub (only when asked). */
export async function joinTeam(code: string, asSub: boolean): Promise<void> {
  const actor = await getActor();
  if (!actor) redirect(`/login?mode=signup&next=${encodeURIComponent(`/t/${code}`)}`);
  const admin = createAdminClient();
  const { data: t } = await admin.from("teams").select(TEAM_COLS).eq("invite_code", code).maybeSingle();
  const team = (t as TeamRow | null) ?? null;
  if (!team) redirect("/teams");
  const me = actor.actorId;
  const existing = await roleOf(admin, team.id, me);
  if (!existing) {
    await admin.from("team_members").insert({ team_id: team.id, member_id: me, role: asSub ? "sub" : "player" });
    if (!asSub) await fanOut(admin, team, await upcomingEvents(admin, team.id), [me]);
  }
  revalidatePath("/teams");
  revalidatePath("/calendar");
  redirect(`/team/${team.id}`);
}

// ---------------------------------------------------------------------------
// Season: games + practices
// ---------------------------------------------------------------------------

/** Turn a pasted league schedule into games to review (nothing is saved yet). */
export async function parseSeasonText(teamId: string, text: string): Promise<{ ok: boolean; events?: ParsedEvent[]; error?: string }> {
  const m = await managed(teamId);
  if ("error" in m) return { ok: false, error: m.error };
  const tz = await serverTimeZone();
  const res = await guardedParse(m.actor.actorId, text, { tz, multiple: true, season: { teamName: m.team.name } });
  if (!res.ok) return { ok: false, error: res.error };
  // Re-derive labels from the machine date so the weekday always matches.
  const events = res.events
    .filter((e) => e.startsAt)
    .map((e) => ({ ...e, when: formatWhen(e.startsAt, tz, e.hasTime) }));
  if (events.length === 0) return { ok: false, error: "Couldn't find any dated games for your team in that." };
  return { ok: true, events };
}

export interface NewTeamEvent {
  title: string;
  startsAt: string;
  hasTime: boolean;
  location?: string;
  kind: TeamEventKind;
  opponent?: string;
  homeAway?: "home" | "away";
}

/** Create games/practices and put them on every player's calendar. */
export async function addTeamEvents(teamId: string, items: NewTeamEvent[]): Promise<TeamResult> {
  const m = await managed(teamId);
  if ("error" in m) return { ok: false, error: m.error };
  const tz = await serverTimeZone();
  const clean = items
    .filter((i) => i.title?.trim() && i.startsAt && !Number.isNaN(Date.parse(i.startsAt)))
    .slice(0, MAX_SEASON_EVENTS)
    .map((i) => ({
      creator_id: m.actor.actorId,
      title: i.title.trim().slice(0, 80),
      event_time: formatWhen(i.startsAt, tz, i.hasTime),
      // Normalized to UTC "Z" so text comparisons/sorting on starts_at line up.
      starts_at: new Date(i.startsAt).toISOString(),
      location: i.location?.trim().slice(0, 120) || null,
      team_id: teamId,
      kind: i.kind === "practice" ? "practice" : "game",
      opponent: i.opponent?.trim().slice(0, 60) || null,
      home_away: i.homeAway === "home" || i.homeAway === "away" ? i.homeAway : null,
      all_day: !i.hasTime,
    }));
  if (clean.length === 0) return { ok: false, error: "Nothing to add — each one needs a date." };

  // Skip anything already on the schedule (same start + same title) — re-pasting is safe.
  const { data: have } = await m.admin
    .from("events")
    .select("title, starts_at")
    .eq("team_id", teamId)
    .is("canceled_at", null)
    .in(
      "starts_at",
      clean.map((c) => c.starts_at),
    );
  const key = (t: string | null, s: string | null) => `${Date.parse(s ?? "")}|${(t ?? "").trim().toLowerCase()}`;
  const seen = new Set((have ?? []).map((h) => key(h.title as string | null, h.starts_at as string | null)));
  const fresh = clean.filter((c) => {
    const k = key(c.title, c.starts_at);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (fresh.length === 0) return { ok: false, error: "Those are already on the schedule." };

  const { data, error } = await m.admin.from("events").insert(fresh).select(EVENT_COLS);
  if (error || !data) return fail(error?.message, "Couldn't add those.");
  try {
    await fanOut(m.admin, m.team, data as TeamEventRow[], await playerIds(m.admin, teamId), {
      accepted: [m.actor.actorId],
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't send them out." };
  }
  revalidatePath(`/team/${teamId}`);
  revalidatePath("/calendar");
  revalidatePath("/today");
  return { ok: true, teamId, count: data.length };
}

/** A weekly practice from its first session through `untilYmd`. */
export async function addWeeklyPractice(
  teamId: string,
  input: { title: string; firstStartsAt: string; untilYmd: string; location?: string },
): Promise<TeamResult> {
  const tz = await serverTimeZone();
  const starts = weeklyStarts(input.firstStartsAt, input.untilYmd, tz);
  if (starts.length === 0) return { ok: false, error: "Pick a first practice and an end date after it." };
  return addTeamEvents(
    teamId,
    starts.map((s) => ({
      title: input.title.trim() || "Practice",
      startsAt: s,
      hasTime: true,
      location: input.location,
      kind: "practice" as const,
    })),
  );
}

// ---------------------------------------------------------------------------
// Game day: answers, headcount, nudge, subs
// ---------------------------------------------------------------------------

/** In / Maybe / Out on a team event (your own card). */
export async function setTeamAnswer(cardId: string, answer: "in" | "maybe" | "out"): Promise<{ ok: boolean; error?: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: card } = await admin
    .from("cards")
    .select("id, user_id, status, content, event_id")
    .eq("id", cardId)
    .maybeSingle();
  if (!card || card.user_id !== actor.actorId) return { ok: false, error: "Couldn't find that." };
  const content = { ...((card.content ?? {}) as Content) };
  if (!content.teamId) return { ok: false, error: "That's not a team event." };
  delete content.maybe;

  if (answer === "maybe") {
    const hadSeat = card.status === "accepted";
    // Maybe also steps out of any waitlist line.
    delete content.waitlistedAt;
    await admin.from("cards").update({ status: "pending", content: { ...content, maybe: "true" } }).eq("id", cardId);
    if (hadSeat && card.event_id) await promoteFromWaitlist(admin, card.event_id as string);
  } else {
    await admin.from("cards").update({ content }).eq("id", cardId);
    const res = await applyRsvp(admin, cardId, answer === "in");
    if (res.state === "full") return { ok: false, error: "This one just filled up." };
  }
  // Answering clears any "are you in?" nudge still waiting on Today.
  if (card.event_id) {
    await admin
      .from("cards")
      .delete()
      .eq("event_id", card.event_id as string)
      .eq("user_id", actor.actorId)
      .eq("type", "event_update")
      .eq("status", "pending")
      .eq("content->>nudge", "true");
  }
  revalidatePath("/today");
  revalidatePath("/calendar");
  if (card.event_id) revalidatePath(`/event/${card.event_id}`);
  return { ok: true };
}

export interface GameHeadcount {
  teamId: string;
  teamName: string;
  canManage: boolean;
  kind: TeamEventKind | null;
  headcount: Headcount;
  entries: TeamAnswerEntry[];
  /** Subs on the roster who haven't been asked for this one yet. */
  subsAvailable: number;
  /** The viewer's own answer + card (for the In/Maybe/Out switch). */
  mine: TeamAnswer;
  myCardId: string | null;
  /** When the last nudge went out (ISO), if one is still waiting. */
  lastNudge: string | null;
}

/** Headcount for one team event, for anyone on it. Null for non-team events (or pre-0043). */
export async function getGameHeadcount(eventId: string): Promise<GameHeadcount | null> {
  const actor = await getActor();
  if (!actor) return null;
  const admin = createAdminClient();
  const { data: ev, error } = await admin.from("events").select("id, team_id, kind").eq("id", eventId).maybeSingle();
  if (error || !ev?.team_id) return null;
  const team = await loadTeam(admin, ev.team_id as string);
  if (!team) return null;

  const answers = (await answersFor(admin, [eventId])).get(eventId) ?? [];
  const role = await roleOf(admin, team.id, actor.actorId);
  const mineRow = answers.find((a) => a.userId === actor.actorId);
  if (!role && !mineRow) return null;

  const names = await namesFor(
    admin,
    answers.map((a) => a.userId),
  );
  const rank: Record<TeamAnswer, number> = { in: 0, maybe: 1, none: 2, out: 3 };
  const entries = answers
    .filter((a) => !a.waitlisted)
    .map((a) => ({ id: a.userId, name: names.get(a.userId)?.name ?? "Someone", answer: a.answer, isSub: a.isSub }))
    .sort((a, b) => rank[a.answer] - rank[b.answer] || a.name.localeCompare(b.name));

  const { data: subs } = await admin.from("team_members").select("member_id").eq("team_id", team.id).eq("role", "sub");
  const asked = new Set(answers.map((a) => a.userId));
  const subsAvailable = (subs ?? []).filter((s) => !asked.has(s.member_id as string)).length;

  const { data: nudges } = await admin
    .from("cards")
    .select("created_at")
    .eq("event_id", eventId)
    .eq("type", "event_update")
    .eq("content->>nudge", "true")
    .order("created_at", { ascending: false })
    .limit(1);

  const kind = (ev.kind as TeamEventKind | null) ?? null;
  return {
    teamId: team.id,
    teamName: team.name,
    canManage: canManage(role),
    kind,
    headcount: tally(
      entries.map((e) => e.answer),
      kind === "practice" ? null : team.min_players,
    ),
    entries,
    subsAvailable,
    mine: mineRow?.answer ?? "none",
    myCardId: mineRow?.cardId ?? null,
    lastNudge: (nudges?.[0]?.created_at as string | undefined) ?? null,
  };
}

const NUDGE_GAP_MS = 2 * 3_600_000;

/** Put an "Are you in?" card on top of Today for everyone who hasn't answered. */
export async function nudgeTeam(eventId: string): Promise<TeamResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: ev } = await admin
    .from("events")
    .select("id, team_id, title, event_time, location, opponent, home_away")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev?.team_id) return { ok: false, error: "That's not a team event." };
  if (!canManage(await roleOf(admin, ev.team_id as string, actor.actorId)))
    return { ok: false, error: "Only the captains can nudge." };

  const { data: recent } = await admin
    .from("cards")
    .select("created_at")
    .eq("event_id", eventId)
    .eq("type", "event_update")
    .eq("content->>nudge", "true")
    .gte("created_at", new Date(Date.now() - NUDGE_GAP_MS).toISOString())
    .limit(1);
  if (recent?.length) return { ok: false, error: "You just nudged — give people a couple of hours." };

  const answers = (await answersFor(admin, [eventId])).get(eventId) ?? [];
  const targets = answers.filter((a) => a.answer === "none" && !a.waitlisted && a.userId !== actor.actorId);
  if (targets.length === 0) return { ok: false, error: "Everyone has answered." };

  const team = await loadTeam(admin, ev.team_id as string);
  const title = gameTitle({
    title: (ev.title as string) ?? "Game",
    opponent: (ev.opponent as string | null) ?? null,
    homeAway: (ev.home_away as "home" | "away" | null) ?? null,
  });
  const content: Content = {
    hostName: team?.name ?? "Your team",
    eventTitle: title,
    eventTime: (ev.event_time as string) ?? "",
    changeSummary: "Are you in?",
    nudge: "true",
  };
  if (ev.location) content.location = ev.location as string;
  // One nudge per person: replace any still-unread earlier one.
  await admin
    .from("cards")
    .delete()
    .eq("event_id", eventId)
    .eq("type", "event_update")
    .eq("status", "pending")
    .eq("content->>nudge", "true");
  const { error } = await admin.from("cards").insert(
    targets.map((t) => ({
      user_id: t.userId,
      sender_id: actor.actorId,
      type: "event_update",
      title,
      content,
      status: "pending",
      event_id: eventId,
    })),
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/event/${eventId}`);
  return { ok: true, count: targets.length };
}

/** Invite the team's subs (who haven't been asked) to this game. */
export async function askSubs(eventId: string): Promise<TeamResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: ev } = await admin.from("events").select(EVENT_COLS + ", team_id").eq("id", eventId).maybeSingle();
  const row = ev as (TeamEventRow & { team_id: string | null }) | null;
  if (!row?.team_id) return { ok: false, error: "That's not a team event." };
  if (!canManage(await roleOf(admin, row.team_id, actor.actorId))) return { ok: false, error: "Only the captains can ask subs." };
  const team = await loadTeam(admin, row.team_id);
  if (!team) return { ok: false, error: "That team doesn't exist." };
  const { data: subs } = await admin.from("team_members").select("member_id").eq("team_id", team.id).eq("role", "sub");
  const ids = (subs ?? []).map((s) => s.member_id as string);
  if (ids.length === 0) return { ok: false, error: "No subs yet — share the team link and pick “Join as a sub”." };
  const sent = await fanOut(admin, team, [row], ids, { extra: { sub: "true" } });
  if (sent === 0) return { ok: false, error: "Every sub has already been asked." };
  revalidatePath(`/event/${eventId}`);
  return { ok: true, count: sent };
}

/** In-count + minimum per team event, for Today's cards. */
export async function headcountsForEvents(
  eventIds: string[],
): Promise<Record<string, { in: number; min: number | null; teamName: string }>> {
  const actor = await getActor();
  if (!actor || eventIds.length === 0) return {};
  const admin = createAdminClient();
  // Only events the caller is on.
  const { data: mine } = await admin
    .from("cards")
    .select("event_id")
    .eq("user_id", actor.actorId)
    .in("event_id", eventIds.slice(0, 100));
  const allowed = [...new Set((mine ?? []).map((r) => r.event_id as string))];
  if (allowed.length === 0) return {};
  const { data: evs, error } = await admin.from("events").select("id, team_id, kind").in("id", allowed);
  if (error) return {};
  const teamIds = [...new Set((evs ?? []).map((e) => e.team_id as string | null).filter((x): x is string => !!x))];
  if (teamIds.length === 0) return {};
  const { data: teams } = await admin.from("teams").select("id, name, min_players").in("id", teamIds);
  const minBy = new Map((teams ?? []).map((t) => [t.id as string, (t.min_players as number | null) ?? null]));
  const nameBy = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  const answers = await answersFor(
    admin,
    (evs ?? []).filter((e) => e.team_id).map((e) => e.id as string),
  );
  const out: Record<string, { in: number; min: number | null; teamName: string }> = {};
  for (const e of evs ?? []) {
    if (!e.team_id) continue;
    const list = answers.get(e.id as string) ?? [];
    out[e.id as string] = {
      in: list.filter((a) => a.answer === "in").length,
      min: e.kind === "practice" ? null : (minBy.get(e.team_id as string) ?? null),
      teamName: nameBy.get(e.team_id as string) ?? "",
    };
  }
  return out;
}

export interface ProfileTeam {
  id: string;
  name: string;
  blurb: string | null;
  role: TeamRole;
  players: number;
  /** The viewer is on this team too (so its page will open for them). */
  viewerOn: boolean;
}

/** Teams someone is on, for their profile. Anyone signed in may look. Empty before 0043. */
export async function listTeamsOf(profileId: string): Promise<ProfileTeam[]> {
  const actor = await getActor();
  if (!actor || !profileId) return [];
  const admin = createAdminClient();
  const { data: rows, error } = await admin.from("team_members").select("team_id, role").eq("member_id", profileId);
  if (error || !rows?.length) return [];
  const ids = rows.map((r) => r.team_id as string);
  const [{ data: teams }, { data: all }] = await Promise.all([
    admin.from("teams").select("id, name, blurb").in("id", ids),
    admin.from("team_members").select("team_id, member_id, role").in("team_id", ids),
  ]);
  const roleBy = new Map(rows.map((r) => [r.team_id as string, r.role as TeamRole]));
  return ((teams ?? []) as { id: string; name: string; blurb: string | null }[])
    .map((t) => {
      const members = (all ?? []).filter((m) => m.team_id === t.id);
      return {
        id: t.id,
        name: t.name,
        blurb: t.blurb,
        role: roleBy.get(t.id) ?? "player",
        players: members.filter((m) => m.role !== "sub").length,
        viewerOn: members.some((m) => m.member_id === actor.actorId),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Captains edit the pinned notes board and the link out to the team's group chat. */
export async function updateTeamBoard(teamId: string, input: { notes: string; chatUrl: string }): Promise<TeamResult> {
  const m = await managed(teamId);
  if ("error" in m) return { ok: false, error: m.error };
  const notes = input.notes.trim().slice(0, 2000) || null;
  let chatUrl: string | null = input.chatUrl.trim() || null;
  if (chatUrl) {
    if (!/^https?:\/\//i.test(chatUrl)) chatUrl = `https://${chatUrl}`;
    try {
      const u = new URL(chatUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad");
      chatUrl = u.toString().slice(0, 300);
    } catch {
      return { ok: false, error: "That chat link doesn't look right." };
    }
  }
  const { error } = await m.admin
    .from("teams")
    .update({ notes, chat_url: chatUrl, notes_updated_at: new Date().toISOString(), notes_by: m.actor.actorId })
    .eq("id", teamId);
  if (error) return { ok: false, error: /notes|chat_url/.test(error.message) ? "Run migration 0044_chat in Supabase to turn on team notes." : error.message };
  revalidatePath(`/team/${teamId}`);
  return { ok: true, teamId };
}
