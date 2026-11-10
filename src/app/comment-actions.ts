"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { canManage, type TeamRole } from "@/lib/teams";
import { chatClosesAt, NEEDS_0044, type ChatMessage, type ChatView, type PrivateThread } from "@/lib/chat";

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

async function namesFor(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await admin.from("profiles").select("id, username, display_name, email").in("id", ids);
  for (const p of data ?? []) {
    out.set(
      p.id as string,
      (p.display_name as string) || ((p.username as string) ? `@${p.username}` : nameFromEmail((p.email as string) || "Someone")),
    );
  }
  return out;
}

interface PlanInfo {
  creatorId: string;
  title: string;
  eventTime: string;
  teamId: string | null;
  closesAt: string | null;
}

/** The plan + whether `actorId` is on it (host or holds an invite card). */
async function planFor(
  admin: Admin,
  eventId: string,
  actorId: string,
): Promise<{ plan: PlanInfo; onIt: boolean; senderOfMine: string | null } | null> {
  const { data: ev } = await admin
    .from("events")
    .select("id, creator_id, title, event_time, starts_at")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return null;
  // team_id / canceled_at are 0043's; tolerate them missing.
  const { data: t } = await admin.from("events").select("team_id, canceled_at").eq("id", eventId).maybeSingle();
  const { data: hostCard } = await admin
    .from("cards")
    .select("content")
    .eq("event_id", eventId)
    .eq("user_id", ev.creator_id as string)
    .eq("type", "social_invite")
    .limit(1)
    .maybeSingle();
  const endsAt = ((hostCard?.content ?? {}) as Record<string, string | null>).endsAt ?? null;
  // On it = the host, or holds an invite they haven't declined (or been removed from).
  let onIt = ev.creator_id === actorId;
  let senderOfMine: string | null = null;
  if (!onIt) {
    const { data: mine } = await admin
      .from("cards")
      .select("id, sender_id")
      .eq("event_id", eventId)
      .eq("user_id", actorId)
      .eq("type", "social_invite")
      .neq("status", "dismissed")
      .limit(1);
    onIt = !!mine?.length;
    senderOfMine = (mine?.[0]?.sender_id as string | null) ?? null;
  }
  const canceled = !!(t as { canceled_at?: string | null } | null)?.canceled_at;
  return {
    plan: {
      creatorId: ev.creator_id as string,
      title: (ev.title as string) ?? "Plan",
      eventTime: (ev.event_time as string) ?? "",
      teamId: ((t as { team_id?: string | null } | null)?.team_id as string | null) ?? null,
      // A canceled plan's chat is closed from that moment.
      closesAt: canceled
        ? ((t as { canceled_at: string }).canceled_at)
        : chatClosesAt(ev.starts_at as string | null, endsAt),
    },
    onIt,
    senderOfMine,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isClosed = (closesAt: string | null) => !!closesAt && Date.parse(closesAt) < Date.now();

/** Host always; on a team event, the team's captains too. */
async function mayAnnounce(admin: Admin, plan: PlanInfo, actorId: string): Promise<boolean> {
  if (plan.creatorId === actorId) return true;
  if (!plan.teamId) return false;
  const { data } = await admin
    .from("team_members")
    .select("role")
    .eq("team_id", plan.teamId)
    .eq("member_id", actorId)
    .maybeSingle();
  return canManage((data?.role as TeamRole | undefined) ?? null);
}

interface Row {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  kind?: string | null;
  private_to?: string | null;
}

/** Everything the plan's chat shows the caller. Empty for people not on the plan. */
export async function getChat(eventId: string): Promise<ChatView | null> {
  const actor = await getActor();
  if (!actor) return null;
  const me = actor.actorId;
  const admin = createAdminClient();
  const found = await planFor(admin, eventId, me);
  if (!found?.onIt) return null;

  let rows: Row[] = [];
  const full = await admin
    .from("event_comments")
    .select("id, author_id, body, created_at, kind, private_to")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (full.error) {
    // Before 0044: everything is plain shared chat.
    const { data } = await admin
      .from("event_comments")
      .select("id, author_id, body, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    rows = (data ?? []) as Row[];
  } else {
    rows = (full.data ?? []) as Row[];
  }

  // Private notes: only the two people in them.
  const visible = rows.filter((r) => !r.private_to || r.private_to === me || r.author_id === me);
  const names = await namesFor(
    admin,
    [...new Set(visible.flatMap((r) => [r.author_id, r.private_to].filter((x): x is string => !!x)))],
  );
  const msg = (r: Row): ChatMessage => ({
    id: r.id,
    authorId: r.author_id,
    authorName: names.get(r.author_id) ?? "Someone",
    body: r.body,
    createdAt: r.created_at,
    isMine: r.author_id === me,
  });

  const threads = new Map<string, PrivateThread>();
  for (const r of visible) {
    if (!r.private_to) continue;
    const other = r.author_id === me ? r.private_to : r.author_id;
    const t = threads.get(other) ?? { otherId: other, otherName: names.get(other) ?? "Someone", messages: [] };
    t.messages.push(msg(r));
    threads.set(other, t);
  }

  return {
    messages: visible.filter((r) => !r.private_to && r.kind !== "announcement").map(msg),
    announcements: visible
      .filter((r) => !r.private_to && r.kind === "announcement")
      .map(msg)
      .reverse(),
    privateThreads: [...threads.values()],
    closesAt: found.plan.closesAt,
    closed: isClosed(found.plan.closesAt),
    canAnnounce: await mayAnnounce(admin, found.plan, me),
  };
}

export interface CommentResult {
  ok: boolean;
  error?: string;
  notified?: number;
}

/**
 * Post to the plan's chat. `announce` (host / team captains only) pins it at the
 * top and puts it on every guest's Today. Closed chats refuse new messages.
 */
export async function postChat(eventId: string, body: string, opts: { announce?: boolean } = {}): Promise<CommentResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const me = actor.actorId;
  const admin = createAdminClient();
  const found = await planFor(admin, eventId, me);
  if (!found?.onIt) return { ok: false, error: "You're not on this plan." };
  if (isClosed(found.plan.closesAt)) return { ok: false, error: "This chat has closed." };
  const clean = body.trim();
  if (!clean) return { ok: false, error: "Write something first." };
  if (clean.length > 2000) return { ok: false, error: "That's too long." };

  if (!opts.announce) {
    const { error } = await admin.from("event_comments").insert({ event_id: eventId, author_id: me, body: clean });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/event/${eventId}`);
    return { ok: true };
  }

  if (!(await mayAnnounce(admin, found.plan, me))) return { ok: false, error: "Only the host can announce." };
  const { error } = await admin
    .from("event_comments")
    .insert({ event_id: eventId, author_id: me, body: clean, kind: "announcement" });
  if (error) return { ok: false, error: /kind/.test(error.message) ? NEEDS_0044 : error.message };

  // On every guest's Today: one rolling announcement card each.
  const { data: cards } = await admin
    .from("cards")
    .select("user_id, status")
    .eq("event_id", eventId)
    .eq("type", "social_invite");
  const guests = [
    ...new Set((cards ?? []).filter((c) => c.status !== "dismissed").map((c) => c.user_id as string)),
  ].filter((id) => id !== me);
  await admin
    .from("cards")
    .delete()
    .eq("event_id", eventId)
    .eq("type", "event_update")
    .eq("status", "pending")
    .eq("content->>announce", "true");
  if (guests.length) {
    let from = (await namesFor(admin, [me])).get(me) ?? "The host";
    if (found.plan.teamId) {
      const { data: team } = await admin.from("teams").select("name").eq("id", found.plan.teamId).maybeSingle();
      if (team?.name) from = team.name as string;
    }
    const content: Record<string, string> = {
      hostName: from,
      eventTitle: found.plan.title,
      eventTime: found.plan.eventTime,
      changeSummary: clean.slice(0, 280),
      announce: "true",
    };
    await admin.from("cards").insert(
      guests.map((uid) => ({
        user_id: uid,
        sender_id: me,
        type: "event_update",
        title: found.plan.title,
        content,
        status: "pending",
        event_id: eventId,
      })),
    );
  }
  revalidatePath(`/event/${eventId}`);
  revalidatePath("/today");
  return { ok: true, notified: guests.length };
}

/** A note only you and one other person on the plan can see. */
export async function sendPrivateNote(eventId: string, toId: string, body: string): Promise<CommentResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const me = actor.actorId;
  if (!toId || toId === me || !UUID_RE.test(toId) || !UUID_RE.test(eventId)) return { ok: false, error: "Pick someone." };
  const admin = createAdminClient();
  const found = await planFor(admin, eventId, me);
  if (!found?.onIt) return { ok: false, error: "You're not on this plan." };
  const other = await planFor(admin, eventId, toId);
  if (!other?.onIt) return { ok: false, error: "They're not on this plan." };
  // Private threads are for an invite and its reply: one of you invited the other,
  // or there's already a thread between you. Not a side channel to anyone on the plan.
  const invitedEachOther = found.senderOfMine === toId || other.senderOfMine === me;
  if (!invitedEachOther) {
    const { data: existing, error: exErr } = await admin
      .from("event_comments")
      .select("id")
      .eq("event_id", eventId)
      .or(`and(author_id.eq.${me},private_to.eq.${toId}),and(author_id.eq.${toId},private_to.eq.${me})`)
      .limit(1);
    if (exErr) return { ok: false, error: NEEDS_0044 };
    if (!existing?.length) return { ok: false, error: "Private notes are between you and the person you invited." };
  }
  if (isClosed(found.plan.closesAt)) return { ok: false, error: "This chat has closed." };
  const clean = body.trim();
  if (!clean) return { ok: false, error: "Write something first." };
  if (clean.length > 2000) return { ok: false, error: "That's too long." };
  const { error } = await admin
    .from("event_comments")
    .insert({ event_id: eventId, author_id: me, body: clean, private_to: toId });
  if (error) return { ok: false, error: /private_to/.test(error.message) ? NEEDS_0044 : error.message };
  revalidatePath(`/event/${eventId}`);
  return { ok: true };
}

/** Your private thread with one person on a plan (for the Today invite card). */
export async function getPrivateWith(eventId: string, otherId: string): Promise<{ messages: ChatMessage[]; closed: boolean }> {
  const actor = await getActor();
  if (!actor || !UUID_RE.test(otherId) || !UUID_RE.test(eventId)) return { messages: [], closed: true };
  const me = actor.actorId;
  const admin = createAdminClient();
  // Just this pair's notes — the caller must be one of the two (enforced by the filter).
  const { data, error } = await admin
    .from("event_comments")
    .select("id, author_id, body, created_at")
    .eq("event_id", eventId)
    .or(`and(author_id.eq.${me},private_to.eq.${otherId}),and(author_id.eq.${otherId},private_to.eq.${me})`)
    .order("created_at", { ascending: true });
  if (error || !data?.length) return { messages: [], closed: true };
  const found = await planFor(admin, eventId, me);
  if (!found?.onIt) return { messages: [], closed: true };
  const names = await namesFor(admin, [me, otherId]);
  return {
    messages: (data as Row[]).map((r) => ({
      id: r.id,
      authorId: r.author_id,
      authorName: names.get(r.author_id) ?? "Someone",
      body: r.body,
      createdAt: r.created_at,
      isMine: r.author_id === me,
    })),
    closed: isClosed(found.plan.closesAt),
  };
}

export async function deleteComment(commentId: string): Promise<CommentResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: c } = await admin
    .from("event_comments")
    .select("id, event_id, author_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!c) return { ok: false, error: "That message is gone." };
  if (c.author_id !== actor.actorId) return { ok: false, error: "Only the author can delete it." };
  await admin.from("event_comments").delete().eq("id", commentId);
  revalidatePath(`/event/${c.event_id as string}`);
  return { ok: true };
}

/** Message counts + the latest line per plan, for a team's game threads list. */
export async function threadSummaries(
  eventIds: string[],
): Promise<Record<string, { count: number; last: { author: string; body: string } | null }>> {
  const actor = await getActor();
  if (!actor || eventIds.length === 0) return {};
  const admin = createAdminClient();
  const { data: mine } = await admin
    .from("cards")
    .select("event_id")
    .eq("user_id", actor.actorId)
    .eq("type", "social_invite")
    .in("event_id", eventIds.slice(0, 100));
  const allowed = [...new Set((mine ?? []).map((r) => r.event_id as string))];
  if (allowed.length === 0) return {};
  type ERow = Row & { event_id: string };
  let rows: ERow[] = [];
  const full = await admin
    .from("event_comments")
    .select("id, event_id, author_id, body, created_at, kind, private_to")
    .in("event_id", allowed)
    .order("created_at", { ascending: true });
  if (full.error) {
    const { data } = await admin
      .from("event_comments")
      .select("id, event_id, author_id, body, created_at")
      .in("event_id", allowed)
      .order("created_at", { ascending: true });
    rows = (data ?? []) as ERow[];
  } else rows = (full.data ?? []) as ERow[];
  const shared = rows.filter((r) => !r.private_to);
  const names = await namesFor(admin, [...new Set(shared.map((r) => r.author_id))]);
  const out: Record<string, { count: number; last: { author: string; body: string } | null }> = {};
  for (const id of allowed) out[id] = { count: 0, last: null };
  for (const r of shared) {
    const s = out[r.event_id];
    s.count += 1;
    s.last = { author: r.author_id === actor.actorId ? "You" : (names.get(r.author_id) ?? "Someone"), body: r.body };
  }
  return out;
}
