"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { type Avail, rankOptions, type PollRespondent, type OptionTally } from "@/lib/schedule";
import { normalizeUsername } from "@/lib/username";
import { startOfTodayISO } from "@/lib/time";

/** Max follower broadcasts one host may send per day (anti-flood). */
const BROADCAST_DAILY_CAP = 5;

type Admin = ReturnType<typeof createAdminClient>;

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

function senderNameOf(actor: NonNullable<Awaited<ReturnType<typeof getActor>>>): string {
  return (
    actor.activeProfile.displayName ||
    actor.activeProfile.username ||
    nameFromEmail(actor.userEmail ?? "A friend")
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecipientMatch {
  id: string;
  username: string;
  email: string;
}

/** Resolve a typed @handle / id / email to a person on the app (any user, not
 *  just friends). Returns null if nothing matches. */
export async function lookupRecipient(raw: string): Promise<RecipientMatch | null> {
  const actor = await getActor();
  if (!actor) return null;
  const admin = createAdminClient();
  const q = raw.trim().replace(/^@/, "");
  if (!q) return null;

  type Prof = { id: string; username: string | null; email: string | null };
  let row: Prof | null = null;
  if (UUID_RE.test(q)) {
    const { data } = await admin.from("profiles").select("id, username, email").eq("id", q).maybeSingle();
    row = (data as Prof | null) ?? null;
  }
  if (!row) {
    const uname = normalizeUsername(q);
    const { data } = await admin.from("profiles").select("id, username, email").eq("username", uname).maybeSingle();
    row = (data as Prof | null) ?? null;
  }
  if (!row && q.includes("@")) {
    const { data } = await admin
      .from("profiles")
      .select("id, username, email")
      .eq("email", q.toLowerCase())
      .maybeSingle();
    row = (data as Prof | null) ?? null;
  }
  if (!row) return null;
  return { id: row.id, username: row.username ?? "", email: row.email ?? "" };
}

/** Prefix typeahead over @usernames (any user but yourself). Up to 8 matches. */
export async function searchProfiles(prefix: string): Promise<RecipientMatch[]> {
  const actor = await getActor();
  if (!actor) return [];
  const q = prefix.trim().replace(/^@/, "").toLowerCase();
  if (q.length < 1) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, username, email")
    .ilike("username", `${q}%`)
    .neq("id", actor.actorId)
    .not("username", "is", null)
    .order("username", { ascending: true })
    .limit(8);
  return (data ?? []).map((p) => ({
    id: p.id as string,
    username: (p.username as string) ?? "",
    email: (p.email as string) ?? "",
  }));
}

export interface PollResult {
  ok: boolean;
  error?: string;
  pollId?: string;
}

export interface EventResult {
  ok: boolean;
  error?: string;
  eventId?: string;
}

/** A group event whose time is already known — create it and send RSVPs now. */
export async function createDirectEvent(input: {
  title: string;
  location?: string;
  note?: string;
  feeCents?: number | null;
  venmoId?: string;
  zelleId?: string;
  eventTime: string;
  startsAt?: string | null;
  hasTime?: boolean;
  /** Optional end time (ISO), kept on each card for display. */
  endsAt?: string | null;
  recipientIds: string[];
  /** A plan that's just you for now — guests can be invited later from its page. */
  allowSolo?: boolean;
}): Promise<EventResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give it a title." };
  const eventTime = input.eventTime.trim();
  if (!eventTime) return { ok: false, error: "Add a date/time." };

  const admin = createAdminClient();
  const recipientIds = [...new Set(input.recipientIds)].filter((id) => id && id !== actor.actorId);
  if (recipientIds.length === 0 && !input.allowSolo) return { ok: false, error: "Add at least one person." };

  const feeCents =
    input.feeCents && Number.isFinite(input.feeCents) && input.feeCents > 0 ? Math.round(input.feeCents) : null;

  const { data: event, error: evErr } = await admin
    .from("events")
    .insert({
      creator_id: actor.actorId,
      title,
      event_time: eventTime,
      starts_at: input.startsAt ?? null,
      location: input.location?.trim() || null,
      note: input.note?.trim() || null,
      fee_cents: feeCents,
      venmo_id: input.venmoId?.trim() || null,
      zelle_id: input.zelleId?.trim() || null,
    })
    .select("id")
    .single();
  if (evErr || !event) return { ok: false, error: evErr?.message ?? "Couldn't create the event." };

  const hostName = senderNameOf(actor);
  // hostId/hostName mark who owns the event (only they can edit) on every copy.
  const content: Record<string, string> = {
    senderName: hostName,
    hostId: actor.actorId,
    hostName,
    eventTime,
    allowReinvite: "false",
  };
  if (input.startsAt) content.startsAt = input.startsAt;
  if (input.endsAt) content.endsAt = input.endsAt;
  if (input.location?.trim()) content.location = input.location.trim();
  if (input.note?.trim()) content.note = input.note.trim();
  if (feeCents) content.fee = String(feeCents);
  if (input.venmoId?.trim()) content.venmoId = input.venmoId.trim();
  if (input.zelleId?.trim()) content.zelleId = input.zelleId.trim();

  const { error } = await admin.from("cards").insert([
    // The host's own copy, so the event is on their calendar too.
    {
      user_id: actor.actorId,
      sender_id: actor.actorId,
      type: "social_invite",
      title,
      content,
      status: "accepted",
      event_id: event.id,
    },
    ...recipientIds.map((rid) => ({
      user_id: rid,
      sender_id: actor.actorId,
      type: "social_invite",
      title,
      content,
      status: "pending",
      event_id: event.id,
    })),
  ]);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/calendar");
  return { ok: true, eventId: event.id as string };
}

/** Public event: broadcast an event to ALL of the host's followers. Capped per
 *  day (anti-flood). Deck bundling collapses multiples from one source. */
export async function createFollowerBroadcast(input: {
  title: string;
  location?: string;
  note?: string;
  feeCents?: number | null;
  venmoId?: string;
  zelleId?: string;
  eventTime: string;
  startsAt?: string | null;
  hasTime?: boolean;
}): Promise<EventResult & { sent?: number }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give it a title." };
  const eventTime = input.eventTime.trim();
  if (!eventTime) return { ok: false, error: "Add a date/time." };

  const admin = createAdminClient();

  // Anti-flood: cap broadcasts per host per day.
  const { data: todays } = await admin
    .from("events")
    .select("id")
    .eq("creator_id", actor.actorId)
    .eq("is_broadcast", true)
    .gte("created_at", startOfTodayISO());
  if ((todays?.length ?? 0) >= BROADCAST_DAILY_CAP) {
    return { ok: false, error: `You've hit today's broadcast limit (${BROADCAST_DAILY_CAP}). Try again tomorrow.` };
  }

  const feeCents =
    input.feeCents && Number.isFinite(input.feeCents) && input.feeCents > 0 ? Math.round(input.feeCents) : null;

  const { data: event, error: evErr } = await admin
    .from("events")
    .insert({
      creator_id: actor.actorId,
      title,
      event_time: eventTime,
      starts_at: input.startsAt ?? null,
      location: input.location?.trim() || null,
      note: input.note?.trim() || null,
      fee_cents: feeCents,
      venmo_id: input.venmoId?.trim() || null,
      zelle_id: input.zelleId?.trim() || null,
      is_broadcast: true,
    })
    .select("id")
    .single();
  if (evErr || !event) return { ok: false, error: evErr?.message ?? "Couldn't create the event." };

  const { data: followerRows } = await admin
    .from("follows")
    .select("follower_id")
    .eq("following_id", actor.actorId);
  const recipientIds = (followerRows ?? []).map((r) => r.follower_id as string);

  if (recipientIds.length > 0) {
    const content: Record<string, string> = { senderName: senderNameOf(actor), eventTime, broadcast: "true" };
    if (input.startsAt) content.startsAt = input.startsAt;
    if (input.location?.trim()) content.location = input.location.trim();
    if (input.note?.trim()) content.note = input.note.trim();
    if (feeCents) content.fee = String(feeCents);
    if (input.venmoId?.trim()) content.venmoId = input.venmoId.trim();
    if (input.zelleId?.trim()) content.zelleId = input.zelleId.trim();

    await admin.from("cards").insert(
      recipientIds.map((rid) => ({
        user_id: rid,
        sender_id: actor.actorId,
        type: "social_invite",
        title,
        content,
        status: "pending",
        event_id: event.id,
      })),
    );
  }

  return { ok: true, eventId: event.id as string, sent: recipientIds.length };
}

/** How many followers the current actor has (for the broadcast composer). */
export async function myFollowerCount(): Promise<number> {
  const actor = await getActor();
  if (!actor) return 0;
  const admin = createAdminClient();
  const { count } = await admin
    .from("follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("following_id", actor.actorId);
  return count ?? 0;
}

export async function createPoll(input: {
  title: string;
  note?: string;
  location?: string;
  feeCents?: number | null;
  venmoId?: string;
  zelleId?: string;
  options: { label: string; startsAt?: string | null }[];
  recipientIds: string[];
}): Promise<PollResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give it a title." };
  const options = input.options
    .map((o) => ({ label: o.label.trim(), startsAt: o.startsAt ?? null }))
    .filter((o) => o.label);
  if (options.length < 2) return { ok: false, error: "Add at least two times to choose between." };

  const admin = createAdminClient();
  const recipientIds = [...new Set(input.recipientIds)].filter((id) => id && id !== actor.actorId);
  if (recipientIds.length === 0) return { ok: false, error: "Add at least one person." };

  const feeCents =
    input.feeCents && Number.isFinite(input.feeCents) && input.feeCents > 0 ? Math.round(input.feeCents) : null;

  const { data: poll, error: pErr } = await admin
    .from("time_polls")
    .insert({
      host_id: actor.actorId,
      title,
      note: input.note?.trim() || null,
      location: input.location?.trim() || null,
      fee_cents: feeCents,
      venmo_id: input.venmoId?.trim() || null,
      zelle_id: input.zelleId?.trim() || null,
    })
    .select("id")
    .single();
  if (pErr || !poll) return { ok: false, error: pErr?.message ?? "Couldn't create the poll." };
  const pollId = poll.id as string;

  const { error: oErr } = await admin
    .from("poll_options")
    .insert(options.map((o, i) => ({ poll_id: pollId, label: o.label, starts_at: o.startsAt, sort: i })));
  if (oErr) return { ok: false, error: oErr.message };

  await admin.from("poll_recipients").insert(
    recipientIds.map((rid) => ({ poll_id: pollId, profile_id: rid })),
  );

  await admin.from("cards").insert(
    recipientIds.map((rid) => ({
      user_id: rid,
      sender_id: actor.actorId,
      type: "time_poll",
      title,
      content: { pollId, senderName: senderNameOf(actor), optionCount: options.length },
      status: "pending",
    })),
  );

  return { ok: true, pollId };
}

export interface PollOptionView {
  id: string;
  label: string;
  /** The viewer's own saved answer, or null if none yet. */
  myAvail: Avail | null;
}

export interface PollView {
  id: string;
  title: string;
  note: string | null;
  location: string | null;
  feeCents: number | null;
  hostName: string;
  isHost: boolean;
  status: string;
  eventId: string | null;
  options: PollOptionView[];
}

export async function getPoll(pollId: string): Promise<PollView | null> {
  const actor = await getActor();
  if (!actor) return null;
  const admin = createAdminClient();

  const { data: poll } = await admin
    .from("time_polls")
    .select("id, host_id, title, note, location, fee_cents, status, event_id")
    .eq("id", pollId)
    .maybeSingle();
  if (!poll) return null;

  const isHost = poll.host_id === actor.actorId;
  if (!isHost) {
    const { data: rec } = await admin
      .from("poll_recipients")
      .select("poll_id")
      .eq("poll_id", pollId)
      .eq("profile_id", actor.actorId)
      .maybeSingle();
    if (!rec) return null;
  }

  const { data: optRows } = await admin
    .from("poll_options")
    .select("id, label, sort")
    .eq("poll_id", pollId)
    .order("sort", { ascending: true });
  const options = optRows ?? [];

  const { data: mine } = await admin
    .from("poll_responses")
    .select("option_id, avail")
    .eq("poll_id", pollId)
    .eq("profile_id", actor.actorId);
  const myById = new Map<string, Avail>((mine ?? []).map((r) => [r.option_id as string, r.avail as Avail]));

  let hostName = "the host";
  if (!isHost) {
    const { data: hp } = await admin
      .from("profiles")
      .select("username, email")
      .eq("id", poll.host_id)
      .maybeSingle();
    hostName = hp?.username ? `@${hp.username}` : nameFromEmail((hp?.email as string) ?? "the host");
  }

  return {
    id: poll.id as string,
    title: poll.title as string,
    note: (poll.note as string | null) ?? null,
    location: (poll.location as string | null) ?? null,
    feeCents: (poll.fee_cents as number | null) ?? null,
    hostName,
    isHost,
    status: poll.status as string,
    eventId: (poll.event_id as string | null) ?? null,
    options: options.map((o) => ({
      id: o.id as string,
      label: o.label as string,
      myAvail: myById.get(o.id as string) ?? null,
    })),
  };
}

export async function submitResponses(
  pollId: string,
  answers: Record<string, Avail>,
): Promise<PollResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();

  const { data: poll } = await admin
    .from("time_polls")
    .select("id, host_id, status")
    .eq("id", pollId)
    .maybeSingle();
  if (!poll) return { ok: false, error: "That poll is gone." };
  if (poll.status !== "open") return { ok: false, error: "This poll is closed." };

  const isHost = poll.host_id === actor.actorId;
  if (!isHost) {
    const { data: rec } = await admin
      .from("poll_recipients")
      .select("poll_id")
      .eq("poll_id", pollId)
      .eq("profile_id", actor.actorId)
      .maybeSingle();
    if (!rec) return { ok: false, error: "You're not on this poll." };
  }

  const { data: optRows } = await admin.from("poll_options").select("id").eq("poll_id", pollId);
  const valid = new Set((optRows ?? []).map((o) => o.id as string));
  const rows = Object.entries(answers)
    .filter(([oid, v]) => valid.has(oid) && (v === 0 || v === 1 || v === 2))
    .map(([oid, v]) => ({
      poll_id: pollId,
      option_id: oid,
      profile_id: actor.actorId,
      avail: v,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return { ok: false, error: "Mark your availability first." };

  const { error } = await admin
    .from("poll_responses")
    .upsert(rows, { onConflict: "option_id,profile_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/poll/${pollId}`);
  return { ok: true, pollId };
}

export interface ResultsOption {
  id: string;
  label: string;
  tally: OptionTally;
}
export interface ResultsPerson {
  id: string;
  name: string;
  responded: boolean;
}
export interface PollResults {
  id: string;
  title: string;
  status: string;
  eventId: string | null;
  people: ResultsPerson[];
  options: ResultsOption[];
  grid: Record<string, Avail>;
  ranked: string[];
}

/** HOST-ONLY: the private results matrix + weighted ranking. */
export async function getResults(pollId: string): Promise<PollResults | null> {
  const actor = await getActor();
  if (!actor) return null;
  const admin = createAdminClient();

  const { data: poll } = await admin
    .from("time_polls")
    .select("id, host_id, title, status, event_id")
    .eq("id", pollId)
    .maybeSingle();
  if (!poll || poll.host_id !== actor.actorId) return null;

  const [{ data: optRows }, { data: recRows }, { data: respRows }] = await Promise.all([
    admin.from("poll_options").select("id, label, sort").eq("poll_id", pollId).order("sort", { ascending: true }),
    admin.from("poll_recipients").select("profile_id").eq("poll_id", pollId),
    admin.from("poll_responses").select("option_id, profile_id, avail").eq("poll_id", pollId),
  ]);
  const options = optRows ?? [];
  const recipientIds = (recRows ?? []).map((r) => r.profile_id as string);

  const nameById = new Map<string, string>();
  if (recipientIds.length > 0) {
    const { data: profs } = await admin.from("profiles").select("id, username, email").in("id", recipientIds);
    for (const p of profs ?? []) {
      nameById.set(
        p.id as string,
        (p.username as string) ? `@${p.username}` : nameFromEmail((p.email as string) ?? "Someone"),
      );
    }
  }

  const grid: Record<string, Avail> = {};
  const byPerson = new Map<string, Record<string, Avail>>();
  const respondedSet = new Set<string>();
  for (const r of respRows ?? []) {
    const pid = r.profile_id as string;
    const oid = r.option_id as string;
    const a = r.avail as Avail;
    grid[`${pid}:${oid}`] = a;
    respondedSet.add(pid);
    const m = byPerson.get(pid) ?? {};
    m[oid] = a;
    byPerson.set(pid, m);
  }

  const respondents: PollRespondent[] = recipientIds.map((id) => ({
    id,
    name: nameById.get(id) ?? "Someone",
    responses: byPerson.get(id) ?? {},
  }));
  const optionIds = options.map((o) => o.id as string);
  const tallies = rankOptions(optionIds, respondents);
  const tallyById = new Map(tallies.map((t) => [t.optionId, t]));

  return {
    id: poll.id as string,
    title: poll.title as string,
    status: poll.status as string,
    eventId: (poll.event_id as string | null) ?? null,
    people: recipientIds.map((id) => ({ id, name: nameById.get(id) ?? "Someone", responded: respondedSet.has(id) })),
    options: options.map((o) => ({
      id: o.id as string,
      label: o.label as string,
      tally: tallyById.get(o.id as string) ?? {
        optionId: o.id as string,
        score: 0,
        free: [],
        maybe: [],
        no: [],
        freeCount: 0,
        maybeCount: 0,
        noCount: 0,
        responseCount: 0,
      },
    })),
    grid,
    ranked: tallies.map((t) => t.optionId),
  };
}

/** HOST-ONLY: lock a winning option into a real event + fire official invites. */
export async function finalizePoll(pollId: string, optionId: string): Promise<PollResult & { eventId?: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();

  const { data: poll } = await admin
    .from("time_polls")
    .select("id, host_id, title, note, location, fee_cents, venmo_id, zelle_id, status")
    .eq("id", pollId)
    .maybeSingle();
  if (!poll || poll.host_id !== actor.actorId) return { ok: false, error: "Only the host can do that." };
  if (poll.status !== "open") return { ok: false, error: "This poll is already finalized." };

  const { data: opt } = await admin
    .from("poll_options")
    .select("id, label, starts_at")
    .eq("id", optionId)
    .eq("poll_id", pollId)
    .maybeSingle();
  if (!opt) return { ok: false, error: "Pick one of the proposed times." };

  const { data: recRows } = await admin.from("poll_recipients").select("profile_id").eq("poll_id", pollId);
  const recipientIds = (recRows ?? []).map((r) => r.profile_id as string);

  const eventTime = (opt.label as string).trim();
  const feeCents = (poll.fee_cents as number | null) ?? null;
  const { data: event, error: evErr } = await admin
    .from("events")
    .insert({
      creator_id: actor.actorId,
      title: poll.title,
      event_time: eventTime,
      starts_at: (opt.starts_at as string | null) ?? null,
      location: (poll.location as string | null) ?? null,
      note: (poll.note as string | null) ?? null,
      fee_cents: feeCents,
      venmo_id: (poll.venmo_id as string | null) ?? null,
      zelle_id: (poll.zelle_id as string | null) ?? null,
    })
    .select("id")
    .single();
  if (evErr || !event) return { ok: false, error: evErr?.message ?? "Couldn't create the event." };

  const content: Record<string, string> = { senderName: senderNameOf(actor), eventTime };
  if (opt.starts_at) content.startsAt = opt.starts_at as string;
  if (poll.location) content.location = poll.location as string;
  if (poll.note) content.note = poll.note as string;
  if (feeCents) content.fee = String(feeCents);
  if (poll.venmo_id) content.venmoId = poll.venmo_id as string;
  if (poll.zelle_id) content.zelleId = poll.zelle_id as string;

  if (recipientIds.length > 0) {
    await admin.from("cards").insert(
      recipientIds.map((rid) => ({
        user_id: rid,
        sender_id: actor.actorId,
        type: "social_invite",
        title: poll.title,
        content,
        status: "pending",
        event_id: event.id,
      })),
    );
  }

  await admin.from("time_polls").update({ status: "closed", event_id: event.id }).eq("id", pollId);
  revalidatePath(`/poll/${pollId}`);
  revalidatePath("/today");
  return { ok: true, pollId, eventId: event.id as string };
}
