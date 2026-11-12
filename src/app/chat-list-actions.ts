"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { chatClosesAt } from "@/lib/chat";
import { inboxCount } from "@/app/inbox-actions";
import { friendIdSet, isStrangerInvite } from "@/lib/friendIds";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChatRow {
  eventId: string;
  /** null = the plan's group chat; otherwise the other person in a private thread. */
  peerId: string | null;
  peerName: string | null;
  planTitle: string;
  startsAt: string | null;
  teamName: string | null;
  last: { author: string; body: string; at: string; announcement: boolean } | null;
  unread: number;
  count: number;
  closed: boolean;
}

interface Msg {
  event_id: string;
  author_id: string;
  body: string;
  created_at: string;
  kind?: string | null;
  private_to?: string | null;
}

/** Every chat the caller is in: one row per plan's group chat and per private thread. */
export async function listChats(): Promise<ChatRow[]> {
  const actor = await getActor();
  if (!actor) return [];
  const me = actor.actorId;
  const admin = createAdminClient();

  const [{ data: myCards }, friends] = await Promise.all([
    admin
      .from("cards")
      .select("event_id, content, status, sender_id, type")
      .eq("user_id", me)
      .eq("type", "social_invite")
      .neq("status", "dismissed")
      .not("event_id", "is", null),
    friendIdSet(admin, me),
  ]);
  const endBy = new Map<string, string | null>();
  for (const c of myCards ?? []) {
    const content = (c.content ?? {}) as Record<string, string | null>;
    // Not yours until you say so: strangers' invites wait under Requests, and a
    // public broadcast only becomes a chat once you've said you're going.
    if (c.status !== "accepted" && (content.broadcast === "true" || isStrangerInvite(c as never, me, friends))) continue;
    endBy.set(c.event_id as string, content.endsAt ?? null);
  }
  const ids = [...endBy.keys()];
  if (ids.length === 0) return [];

  const now = Date.now();
  const { data: evs } = await admin.from("events").select("*").in("id", ids);
  const closedAt = (e: { id: string; starts_at?: string | null; canceled_at?: string | null }) =>
    e.canceled_at ?? chatClosesAt(e.starts_at ?? null, endBy.get(e.id) ?? null);
  const isClosed = (e: { id: string }) => {
    const c = closedAt(e as never);
    return !!c && Date.parse(c) < now;
  };
  const openIds = (evs ?? []).filter((e) => !isClosed(e as never)).map((e) => e.id as string);
  // Closed chats: only the 30 most recent plans, and only a message count.
  const closedIds = (evs ?? [])
    .filter((e) => isClosed(e as never))
    .sort((x, y) => Date.parse((y.starts_at as string) ?? "") - Date.parse((x.starts_at as string) ?? ""))
    .slice(0, 30)
    .map((e) => e.id as string);

  const none = { data: [] as Msg[], error: null };
  const [full, closedMsgs, readsRes, { data: others }] = await Promise.all([
    openIds.length
      ? admin
          .from("event_comments")
          .select("event_id, author_id, body, created_at, kind, private_to")
          .in("event_id", openIds)
          .order("created_at", { ascending: false })
          .limit(1000)
      : none,
    closedIds.length ? admin.from("event_comments").select("event_id, private_to").in("event_id", closedIds).limit(1000) : none,
    admin.from("chat_reads").select("event_id, thread, last_read_at").eq("user_id", me),
    admin.from("cards").select("event_id, user_id").eq("type", "social_invite").neq("status", "dismissed").in("event_id", openIds.length ? openIds : ids.slice(0, 1)),
  ]);
  let msgs = ((full.data ?? []) as Msg[]).slice().reverse();
  if (full.error && openIds.length) {
    // Before 0044: plain shared chat only.
    const { data } = await admin
      .from("event_comments")
      .select("event_id, author_id, body, created_at")
      .in("event_id", openIds)
      .order("created_at", { ascending: false })
      .limit(1000);
    msgs = ((data ?? []) as Msg[]).slice().reverse();
  }
  msgs = msgs.filter((m) => !m.private_to || m.private_to === me || m.author_id === me);
  const closedCount = new Map<string, number>();
  let closedRows = (closedMsgs.data ?? []) as { event_id: string; private_to?: string | null }[];
  if (closedMsgs.error && closedIds.length) {
    const { data } = await admin.from("event_comments").select("event_id").in("event_id", closedIds).limit(1000);
    closedRows = (data ?? []) as { event_id: string }[];
  }
  for (const m of closedRows) if (!m.private_to) closedCount.set(m.event_id, (closedCount.get(m.event_id) ?? 0) + 1);
  // No read-tracking yet (before 0045): show no unread rather than a badge that can't clear.
  const tracking = !readsRes.error;
  const reads = readsRes.data;
  // A thread you've never opened only counts the last week as unread, not its whole history.
  const FRESH = now - 7 * 86_400_000;

  const readAt = new Map<string, number>();
  for (const r of reads ?? []) readAt.set(`${r.event_id}:${r.thread}`, Date.parse(r.last_read_at as string));
  const people = new Map<string, Set<string>>();
  for (const o of others ?? []) {
    const s = people.get(o.event_id as string) ?? new Set<string>();
    s.add(o.user_id as string);
    people.set(o.event_id as string, s);
  }

  const nameIds = new Set<string>();
  for (const m of msgs) {
    nameIds.add(m.author_id);
    if (m.private_to) nameIds.add(m.private_to);
  }
  const names = new Map<string, string>();
  if (nameIds.size) {
    const { data: profs } = await admin.from("profiles").select("id, username, display_name, email").in("id", [...nameIds]);
    for (const p of profs ?? []) {
      names.set(
        p.id as string,
        (p.display_name as string) || (p.username as string) || ((p.email as string) ?? "Someone").split("@")[0],
      );
    }
  }
  const teamIds = [...new Set((evs ?? []).map((e) => (e as { team_id?: string | null }).team_id).filter((x): x is string => !!x))];
  const teamName = new Map<string, string>();
  if (teamIds.length) {
    const { data: teams } = await admin.from("teams").select("id, name").in("id", teamIds);
    for (const t of teams ?? []) teamName.set(t.id as string, t.name as string);
  }

  const rows: ChatRow[] = [];
  const closedSet = new Set(closedIds);
  for (const e of evs ?? []) {
    const id = e.id as string;
    const ev = e as { title?: string | null; starts_at?: string | null; team_id?: string | null; canceled_at?: string | null };
    const closed = isClosed(e as never);
    if (closed) {
      const count = closedCount.get(id) ?? 0;
      if (closedSet.has(id) && count > 0) {
        rows.push({
          eventId: id,
          peerId: null,
          peerName: null,
          planTitle: ev.title ?? "Plan",
          startsAt: ev.starts_at ?? null,
          teamName: ev.team_id ? (teamName.get(ev.team_id) ?? null) : null,
          last: null,
          unread: 0,
          count,
          closed: true,
        });
      }
      continue;
    }
    const mine = msgs.filter((m) => m.event_id === id);
    const base = {
      eventId: id,
      planTitle: ev.title ?? "Plan",
      startsAt: ev.starts_at ?? null,
      teamName: ev.team_id ? (teamName.get(ev.team_id) ?? null) : null,
      closed,
    };
    const summarize = (list: Msg[], thread: string) => {
      const seen = readAt.get(`${id}:${thread}`) ?? FRESH;
      const lastMsg = list[list.length - 1];
      return {
        last: lastMsg
          ? {
              author: lastMsg.author_id === me ? "You" : (names.get(lastMsg.author_id) ?? "Someone"),
              body: lastMsg.body,
              at: lastMsg.created_at,
              announcement: lastMsg.kind === "announcement",
            }
          : null,
        unread: tracking ? list.filter((m) => m.author_id !== me && Date.parse(m.created_at) > seen).length : 0,
        count: list.length,
      };
    };

    const shared = mine.filter((m) => !m.private_to);
    const upcoming = !!ev.starts_at && Date.parse(ev.starts_at) > now;
    // A group row once anyone has written, or for an upcoming plan with other people on it.
    if (shared.length > 0 || (upcoming && (people.get(id)?.size ?? 0) > 1)) {
      rows.push({ ...base, peerId: null, peerName: null, ...summarize(shared, "group") });
    }
    const peers = new Map<string, Msg[]>();
    for (const m of mine) {
      if (!m.private_to) continue;
      const other = m.author_id === me ? m.private_to : m.author_id;
      peers.set(other, [...(peers.get(other) ?? []), m]);
    }
    for (const [peer, list] of peers) {
      rows.push({ ...base, peerId: peer, peerName: names.get(peer) ?? "Someone", ...summarize(list, peer) });
    }
  }

  const key = (r: ChatRow) => Date.parse(r.last?.at ?? r.startsAt ?? "") || 0;
  return rows.sort((a, b) => Number(a.closed) - Number(b.closed) || key(b) - key(a));
}

/** Mark threads on a plan as read up to now. `threads`: "group" and/or peer ids. */
export async function markChatRead(eventId: string, threads: string[]): Promise<void> {
  const actor = await getActor();
  if (!actor || !UUID_RE.test(eventId)) return;
  const clean = [...new Set(threads)].filter((t) => t === "group" || UUID_RE.test(t)).slice(0, 20);
  if (clean.length === 0) return;
  const admin = createAdminClient();
  const at = new Date().toISOString();
  // Missing table (before 0045) just means nothing is tracked yet.
  await admin
    .from("chat_reads")
    .upsert(
      clean.map((thread) => ({ user_id: actor.actorId, event_id: eventId, thread, last_read_at: at })),
      { onConflict: "user_id,event_id,thread" },
    );
}

/** Badge for the Chats tab: unread messages + requests waiting on you. */
export async function chatsBadge(): Promise<number> {
  try {
    const [rows, requests] = await Promise.all([listChats(), inboxCount()]);
    return rows.reduce((n, r) => n + r.unread, 0) + requests;
  } catch {
    return 0;
  }
}
