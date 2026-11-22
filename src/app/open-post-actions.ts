"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { friendIdSet } from "@/lib/friendIds";
import { isoFromLocal } from "@/lib/localDateTime";
import { cleanCity } from "@/lib/scout/safety";
import { serverTimeZone } from "@/lib/tz";
import { createDirectEvent } from "@/app/poll-actions";
import { ago, isThisWeekend, titleFromBody, whenLabel, type Audience, type FeedPost } from "@/lib/openPosts";

type Admin = ReturnType<typeof createAdminClient>;

const NEEDS_0048 = "Posts need database migration 0048 — run it in Supabase, then try again.";
const POSTS_PER_DAY = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PostRow {
  id: string;
  author_id: string;
  body: string;
  starts_at: string | null;
  has_time: boolean;
  audience: Audience;
  area: string | null;
  event_id: string | null;
  expires_at: string;
  created_at: string;
}
const POST_COLS = "id, author_id, body, starts_at, has_time, audience, area, event_id, expires_at, created_at";

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
}

function safeTz(tz: unknown): string {
  try {
    if (typeof tz === "string" && tz) {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    }
  } catch {}
  return "America/Los_Angeles";
}

/** Who I can see posts from, and how I know them. */
interface Circle {
  me: string;
  friends: Set<string>;
  /** friend-of-friend id → one mutual friend's id */
  fofVia: Map<string, string>;
  areas: Set<string>;
}

async function circleOf(admin: Admin, me: string): Promise<Circle> {
  const friends = await friendIdSet(admin, me);
  const fofVia = new Map<string, string>();
  const ids = [...friends];
  if (ids.length) {
    const [a, b] = await Promise.all([
      admin.from("friendships").select("requester_id, addressee_id").eq("status", "accepted").in("requester_id", ids.slice(0, 300)),
      admin.from("friendships").select("requester_id, addressee_id").eq("status", "accepted").in("addressee_id", ids.slice(0, 300)),
    ]);
    for (const r of [...(a.data ?? []), ...(b.data ?? [])] as { requester_id: string; addressee_id: string }[]) {
      const [via, other] = friends.has(r.requester_id) ? [r.requester_id, r.addressee_id] : [r.addressee_id, r.requester_id];
      if (other !== me && !friends.has(other) && !fofVia.has(other)) fofVia.set(other, via);
    }
  }
  const { data: prefs } = await admin.from("preferences").select("locations").eq("user_id", me).maybeSingle();
  const areas = new Set(
    (((prefs?.locations as string[] | null) ?? []) as string[]).map((c) => cleanCity(c).toLowerCase()).filter(Boolean),
  );
  return { me, friends, fofVia, areas };
}

function canSee(p: PostRow, c: Circle): boolean {
  if (p.author_id === c.me || c.friends.has(p.author_id)) return true;
  if (p.audience === "friends") return false;
  if (c.fofVia.has(p.author_id)) return true;
  return p.audience === "nearby" && !!p.area && c.areas.has(p.area.toLowerCase());
}

async function namesOf(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return new Map();
  const { data } = await admin.from("profiles").select("id, username, display_name").in("id", uniq);
  return new Map(
    ((data ?? []) as { id: string; username: string | null; display_name: string | null }[]).map((p) => [
      p.id,
      p.username || p.display_name || "someone",
    ]),
  );
}

async function loadPost(admin: Admin, id: string): Promise<PostRow | null> {
  if (!UUID_RE.test(id)) return null;
  const { data } = await admin.from("open_posts").select(POST_COLS).eq("id", id).maybeSingle();
  return (data as PostRow | null) ?? null;
}

/* --------------------------------- write --------------------------------- */

export async function createOpenPost(input: {
  body: string;
  day: string;
  time: string | null;
  audience: Audience;
  tz: string;
}): Promise<Result> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const body = String(input.body ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 500);
  if (!body) return { ok: false, error: "Write something first." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) return { ok: false, error: "Pick a day." };
  const time = typeof input.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) ? input.time : null;
  const audience: Audience = input.audience === "friends" || input.audience === "nearby" ? input.audience : "fof";
  const tz = safeTz(input.tz);
  const startsAt = isoFromLocal(input.day, time, tz);
  const expiresAt = isoFromLocal(input.day, "23:59", tz);
  if (!startsAt || !expiresAt || Date.parse(expiresAt) < Date.now()) return { ok: false, error: "Pick today or a day ahead." };
  if (Date.parse(startsAt) - Date.now() > 60 * 86_400_000) return { ok: false, error: "Keep it within the next two months." };

  const admin = createAdminClient();
  const me = actor.actorId;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: cErr } = await admin
    .from("open_posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", me)
    .gte("created_at", since);
  if (cErr) return { ok: false, error: NEEDS_0048 };
  if ((count ?? 0) >= POSTS_PER_DAY) return { ok: false, error: "That's a lot of posts today — try again tomorrow." };

  const { data: prefs } = await admin.from("preferences").select("locations").eq("user_id", me).maybeSingle();
  const area = cleanCity(((prefs?.locations as string[] | null) ?? [])[0] ?? "") || null;

  const { data, error } = await admin
    .from("open_posts")
    .insert({ author_id: me, body, starts_at: startsAt, has_time: !!time, audience, area, expires_at: expiresAt })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't post that." };
  revalidatePath("/today");
  return { ok: true, id: data.id as string };
}

export async function deleteOpenPost(id: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const p = await loadPost(admin, id);
  if (!p || p.author_id !== actor.actorId) return { ok: false, error: "Only the poster can delete it." };
  // Take the "maybe" entries off savers' calendars too.
  const { data: saves } = await admin.from("open_post_saves").select("card_id").eq("post_id", id);
  const cardIds = (saves ?? []).map((s) => s.card_id as string | null).filter((x): x is string => !!x);
  if (cardIds.length) await admin.from("cards").update({ status: "dismissed" }).in("id", cardIds);
  await admin.from("open_posts").delete().eq("id", id);
  revalidatePath("/today");
  return { ok: true };
}

/** Save = a "maybe" on your calendar (and the poster sees one more save). Tapping again undoes it. */
export async function toggleSave(id: string): Promise<{ ok: boolean; saved?: boolean; error?: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const me = actor.actorId;
  const admin = createAdminClient();
  const p = await loadPost(admin, id);
  if (!p || Date.parse(p.expires_at) < Date.now() || !canSee(p, await circleOf(admin, me))) {
    return { ok: false, error: "That post isn't available." };
  }
  if (p.author_id === me) return { ok: false, error: "It's your own post." };

  const { data: existing } = await admin.from("open_post_saves").select("card_id").eq("post_id", id).eq("user_id", me).maybeSingle();
  if (existing) {
    if (existing.card_id) await admin.from("cards").update({ status: "dismissed" }).eq("id", existing.card_id).eq("user_id", me);
    await admin.from("open_post_saves").delete().eq("post_id", id).eq("user_id", me);
    revalidatePath("/calendar");
    return { ok: true, saved: false };
  }

  const names = await namesOf(admin, [p.author_id]);
  const tz = await serverTimeZone();
  const content: Record<string, string> = {
    time: whenLabel(p.starts_at, p.has_time, tz),
    details: p.body,
    fromName: `@${names.get(p.author_id) ?? "someone"}`,
    openPostId: p.id,
    maybe: "true",
  };
  if (p.starts_at) content.startsAt = p.starts_at;
  if (!p.has_time && p.starts_at) content.time = whenLabel(p.starts_at, false, tz);
  const { data: card, error: cardErr } = await admin
    .from("cards")
    .insert({ user_id: me, sender_id: p.author_id, type: "calendar_radar", title: titleFromBody(p.body), content, status: "accepted" })
    .select("id")
    .single();
  if (cardErr) return { ok: false, error: cardErr.message };
  const { error } = await admin.from("open_post_saves").insert({ post_id: id, user_id: me, card_id: card?.id ?? null });
  if (error) {
    if (card?.id) await admin.from("cards").delete().eq("id", card.id);
    return { ok: false, error: error.message };
  }
  await noteSave(admin, p, me).catch(() => {});
  revalidatePath("/calendar");
  return { ok: true, saved: true };
}

/**
 * Tell the poster on Today: one note per post, kept current ("marcus and 2 others
 * saved your post"), back on top of For you each time someone new saves.
 */
async function noteSave(admin: Admin, p: PostRow, saverId: string) {
  const [{ count }, names] = await Promise.all([
    admin.from("open_post_saves").select("user_id", { count: "exact", head: true }).eq("post_id", p.id),
    namesOf(admin, [saverId]),
  ]);
  const who = names.get(saverId) ?? "Someone";
  const n = count ?? 1;
  const content: Record<string, string> = {
    openPostId: p.id,
    hostName: who,
    eventTitle: titleFromBody(p.body),
    changeSummary: n > 1 ? `${who} and ${n - 1} ${n - 1 === 1 ? "other" : "others"} saved your post` : `${who} saved your post`,
  };
  const { data: existing } = await admin
    .from("cards")
    .select("id")
    .eq("user_id", p.author_id)
    .eq("type", "event_update")
    .eq("content->>openPostId", p.id)
    .limit(1)
    .maybeSingle();
  if (existing) {
    await admin
      .from("cards")
      .update({ content, status: "pending", created_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await admin.from("cards").insert({
      user_id: p.author_id,
      sender_id: saverId,
      type: "event_update",
      title: titleFromBody(p.body),
      content,
      status: "pending",
      prune_at: p.expires_at,
    });
  }
}

/** Opened the post: everything sent to me on it is read. */
export async function markPostRead(id: string): Promise<void> {
  const actor = await getActor();
  if (!actor || !UUID_RE.test(id)) return;
  await createAdminClient()
    .from("open_post_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("post_id", id)
    .eq("to_id", actor.actorId)
    .is("read_at", null);
}

export interface PostChatRow {
  postId: string;
  peerId: string;
  peerName: string;
  title: string;
  startsAt: string | null;
  last: { author: string; body: string; at: string } | null;
  unread: number;
  count: number;
  closed: boolean;
}

/** Private post threads for the Chats tab. They close two days after the post's day. Empty before 0048/0049. */
export async function listPostChats(): Promise<PostChatRow[]> {
  const actor = await getActor();
  if (!actor) return [];
  const me = actor.actorId;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("open_post_messages")
    .select("post_id, sender_id, to_id, body, created_at, read_at")
    .or(`sender_id.eq.${me},to_id.eq.${me}`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data?.length) return [];
  const msgs = (data as { post_id: string; sender_id: string; to_id: string; body: string; created_at: string; read_at: string | null }[]).reverse();
  const postIds = [...new Set(msgs.map((m) => m.post_id))];
  const { data: posts } = await admin.from("open_posts").select("id, body, starts_at, expires_at").in("id", postIds);
  const postBy = new Map(((posts ?? []) as { id: string; body: string; starts_at: string | null; expires_at: string }[]).map((p) => [p.id, p]));
  const threads = new Map<string, typeof msgs>();
  for (const m of msgs) {
    if (!postBy.has(m.post_id)) continue;
    const peer = m.sender_id === me ? m.to_id : m.sender_id;
    const k = `${m.post_id}:${peer}`;
    threads.set(k, [...(threads.get(k) ?? []), m]);
  }
  const names = await namesOf(admin, [...threads.keys()].map((k) => k.split(":")[1]));
  const rows: PostChatRow[] = [];
  for (const [k, list] of threads) {
    const [postId, peer] = k.split(":");
    const post = postBy.get(postId)!;
    const last = list[list.length - 1];
    rows.push({
      postId,
      peerId: peer,
      peerName: names.get(peer) ?? "someone",
      title: titleFromBody(post.body),
      startsAt: post.starts_at,
      last: { author: last.sender_id === me ? "You" : (names.get(last.sender_id) ?? "someone"), body: last.body, at: last.created_at },
      unread: list.filter((m) => m.to_id === me && !m.read_at).length,
      count: list.length,
      closed: Date.parse(post.expires_at) + 2 * 86_400_000 < Date.now(),
    });
  }
  return rows;
}

/** Poster only: make it a real plan, invite everyone who saved it, and link the post to it. */
export async function convertToPlan(id: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const p = await loadPost(admin, id);
  if (!p || p.author_id !== actor.actorId) return { ok: false, error: "Only the poster can do that." };
  if (p.event_id) return { ok: true, id: p.event_id };
  if (!p.starts_at) return { ok: false, error: "This post has no day." };

  const { data: saves } = await admin.from("open_post_saves").select("user_id, card_id").eq("post_id", id);
  const savers = (saves ?? []) as { user_id: string; card_id: string | null }[];
  const tz = await serverTimeZone();
  const res = await createDirectEvent({
    title: titleFromBody(p.body),
    note: p.body,
    eventTime: whenLabel(p.starts_at, p.has_time, tz),
    startsAt: p.starts_at,
    hasTime: p.has_time,
    recipientIds: savers.map((s) => s.user_id),
    allowSolo: true,
  });
  if (!res.ok || !res.eventId) return { ok: false, error: res.error ?? "Couldn't make the plan." };
  // Their invite replaces the "maybe" entry.
  const cardIds = savers.map((s) => s.card_id).filter((x): x is string => !!x);
  if (cardIds.length) await admin.from("cards").update({ status: "dismissed" }).in("id", cardIds);
  await admin.from("open_posts").update({ event_id: res.eventId }).eq("id", id);
  revalidatePath("/today");
  revalidatePath(`/p/${id}`);
  return { ok: true, id: res.eventId };
}

/** A private message between a reader and the poster. The poster replies to someone who wrote or saved. */
export async function sendPostMessage(id: string, body: string, toId?: string): Promise<Result> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const me = actor.actorId;
  const text = String(body ?? "").trim().slice(0, 1000);
  if (!text) return { ok: false, error: "Write a message." };
  const admin = createAdminClient();
  const p = await loadPost(admin, id);
  if (!p || !canSee(p, await circleOf(admin, me))) return { ok: false, error: "That post isn't available." };

  let to = p.author_id;
  if (p.author_id === me) {
    if (!toId || !UUID_RE.test(toId)) return { ok: false, error: "Who's it to?" };
    const [{ data: wrote }, { data: saved }] = await Promise.all([
      admin.from("open_post_messages").select("id").eq("post_id", id).eq("sender_id", toId).limit(1),
      admin.from("open_post_saves").select("user_id").eq("post_id", id).eq("user_id", toId).limit(1),
    ]);
    if (!wrote?.length && !saved?.length) return { ok: false, error: "You can reply to people who wrote or saved it." };
    to = toId;
  }
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("open_post_messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", me)
    .gte("created_at", since);
  if ((count ?? 0) >= 60) return { ok: false, error: "Slow down a little — try again soon." };
  const { error } = await admin.from("open_post_messages").insert({ post_id: id, sender_id: me, to_id: to, body: text });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/p/${id}`);
  return { ok: true };
}

/* ---------------------------------- read --------------------------------- */

async function toFeed(admin: Admin, rows: PostRow[], c: Circle, tz: string): Promise<FeedPost[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const eventIds = rows.map((r) => r.event_id).filter((x): x is string => !!x);
  const [{ data: saves }, names, { data: evs }, { data: going }] = await Promise.all([
    admin.from("open_post_saves").select("post_id, user_id").in("post_id", ids),
    namesOf(admin, [...rows.map((r) => r.author_id), ...c.fofVia.values()]),
    eventIds.length ? admin.from("events").select("id, title, starts_at").in("id", eventIds) : Promise.resolve({ data: [] }),
    eventIds.length
      ? admin.from("cards").select("event_id").eq("type", "social_invite").eq("status", "accepted").in("event_id", eventIds)
      : Promise.resolve({ data: [] }),
  ]);
  const saveCount = new Map<string, number>();
  const mineSaved = new Set<string>();
  for (const s of (saves ?? []) as { post_id: string; user_id: string }[]) {
    saveCount.set(s.post_id, (saveCount.get(s.post_id) ?? 0) + 1);
    if (s.user_id === c.me) mineSaved.add(s.post_id);
  }
  const evById = new Map(((evs ?? []) as { id: string; title: string | null; starts_at: string | null }[]).map((e) => [e.id, e]));
  const goingBy = new Map<string, number>();
  for (const g of (going ?? []) as { event_id: string }[]) goingBy.set(g.event_id, (goingBy.get(g.event_id) ?? 0) + 1);

  return rows.map((r) => {
    const relation =
      r.author_id === c.me
        ? "You"
        : c.friends.has(r.author_id)
          ? "Friend"
          : c.fofVia.has(r.author_id)
            ? `Friend of ${names.get(c.fofVia.get(r.author_id)!) ?? "a friend"}`
            : "Nearby";
    const ev = r.event_id ? evById.get(r.event_id) : undefined;
    let plan: FeedPost["plan"] = null;
    if (ev) {
      const d = ev.starts_at ? new Date(ev.starts_at) : null;
      const n = goingBy.get(ev.id) ?? 1;
      plan = {
        eventId: ev.id,
        title: ev.title ?? "Plan",
        day: d ? new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(d) : "",
        mon: d ? new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(d).toUpperCase() : "",
        sub: `${whenLabel(ev.starts_at, r.has_time, tz)} · ${n} going`,
      };
    }
    return {
      id: r.id,
      authorId: r.author_id,
      authorName: names.get(r.author_id) ?? "someone",
      relation,
      ago: ago(r.created_at),
      body: r.body,
      when: whenLabel(r.starts_at, r.has_time, tz),
      saves: saveCount.get(r.id) ?? 0,
      savedByMe: mineSaved.has(r.id),
      mine: r.author_id === c.me,
      plan,
    };
  });
}

export type FeedTab = "nearby" | "friends" | "weekend";

/** The open posts I can see that haven't ended: soonest first, then newest. Null before migration 0048. */
export async function listOpenPosts(tab: FeedTab): Promise<FeedPost[] | null> {
  const actor = await getActor();
  if (!actor) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("open_posts")
    .select(POST_COLS)
    .gt("expires_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(300);
  if (error) return null;
  const c = await circleOf(admin, actor.actorId);
  const tz = await serverTimeZone();
  const rows = ((data ?? []) as PostRow[])
    .filter((p) => canSee(p, c))
    .filter((p) => (tab === "friends" ? p.author_id === c.me || c.friends.has(p.author_id) : true))
    .filter((p) => (tab === "weekend" ? isThisWeekend(p.starts_at, tz) : true))
    .slice(0, 60);
  return toFeed(admin, rows, c, tz);
}

export interface PostThread {
  withId: string;
  withName: string;
  saved: boolean;
  messages: { mine: boolean; body: string; at: string }[];
}

/** One post: for the poster, who saved it and each private thread; for anyone else, their thread with the poster. */
export async function getOpenPost(id: string): Promise<{ post: FeedPost; ended: boolean; threads: PostThread[] } | null> {
  const actor = await getActor();
  if (!actor) return null;
  const me = actor.actorId;
  const admin = createAdminClient();
  const p = await loadPost(admin, id);
  if (!p) return null;
  const c = await circleOf(admin, me);
  if (!canSee(p, c)) return null;
  const tz = await serverTimeZone();
  const [post] = await toFeed(admin, [p], c, tz);

  const mineQ = admin.from("open_post_messages").select("sender_id, to_id, body, created_at").eq("post_id", id).order("created_at");
  const { data: msgs } = await (p.author_id === me ? mineQ : mineQ.or(`sender_id.eq.${me},to_id.eq.${me}`));
  const { data: saves } = p.author_id === me ? await admin.from("open_post_saves").select("user_id").eq("post_id", id) : { data: [] };
  const saverIds = new Set(((saves ?? []) as { user_id: string }[]).map((s) => s.user_id));

  const byPeer = new Map<string, PostThread["messages"]>();
  for (const m of (msgs ?? []) as { sender_id: string; to_id: string; body: string; created_at: string }[]) {
    const peer = m.sender_id === me ? m.to_id : m.sender_id;
    if (!byPeer.has(peer)) byPeer.set(peer, []);
    byPeer.get(peer)!.push({ mine: m.sender_id === me, body: m.body, at: m.created_at });
  }
  if (p.author_id === me) {
    for (const s of saverIds) if (!byPeer.has(s)) byPeer.set(s, []);
  } else if (!byPeer.has(p.author_id)) {
    byPeer.set(p.author_id, []);
  }
  const names = await namesOf(admin, [...byPeer.keys()]);
  const threads = [...byPeer.entries()].map(([peer, messages]) => ({
    withId: peer,
    withName: names.get(peer) ?? "someone",
    saved: saverIds.has(peer),
    messages,
  }));
  return { post, ended: Date.parse(p.expires_at) < Date.now(), threads };
}
