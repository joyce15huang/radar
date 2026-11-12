"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { serverTimeZone } from "@/lib/tz";
import { formatWhen } from "@/lib/localDateTime";
import { friendIdSet } from "@/lib/friendIds";
import { guardedParse } from "@/lib/parse/guarded";
import { publicImageUrl } from "@/lib/storage";
import { localMidnightISO, ymd } from "@/lib/time";
import { CATEGORIES, scopeWindow, type ExplorePost, type PostDate, type Scope } from "@/lib/explore";

type Admin = ReturnType<typeof createAdminClient>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEEDS_0046 = "Run migration 0046_date_posts in Supabase to turn on posts.";
const MAX_DATES = 30;
const MAX_IMAGES = 6;
const POSTS_PER_DAY = 10;

interface PostRow {
  id: string;
  author_id: string;
  title: string;
  body: string | null;
  image_paths: string[] | null;
  audience: "friends" | "public";
  category: string | null;
  source_url: string | null;
  created_at: string;
}
interface DateRow {
  id: string;
  post_id: string;
  label: string;
  starts_at: string;
  all_day: boolean;
  location: string | null;
}

/** Can `viewer` see this post? Public, their own, or a friend's. */
const visible = (p: PostRow, viewer: string, friends: Set<string>) =>
  p.audience === "public" || p.author_id === viewer || friends.has(p.author_id);

async function authorsFor(admin: Admin, ids: string[]): Promise<Map<string, { name: string; isPublic: boolean }>> {
  const out = new Map<string, { name: string; isPublic: boolean }>();
  if (ids.length === 0) return out;
  const { data } = await admin.from("profiles").select("id, username, display_name, email, verified").in("id", ids);
  for (const p of data ?? []) {
    out.set(p.id as string, {
      name: (p.display_name as string) || (p.username as string) || ((p.email as string) ?? "Someone").split("@")[0],
      isPublic: !!p.verified,
    });
  }
  return out;
}

/** The viewer's calendar: which post dates they've added, and when they're busy. */
async function myCalendar(admin: Admin, me: string): Promise<{ added: Set<string>; busy: [number, number][] }> {
  const { data } = await admin
    .from("cards")
    .select("type, content")
    .eq("user_id", me)
    .eq("status", "accepted")
    .in("type", ["social_invite", "calendar_radar", "time_window"]);
  const added = new Set<string>();
  const busy: [number, number][] = [];
  for (const c of data ?? []) {
    const content = (c.content ?? {}) as Record<string, string | null>;
    if (content.postDateId) added.add(content.postDateId);
    const t = Date.parse(content.startsAt ?? "");
    // Dates added from posts are markers, not commitments — they don't make you busy.
    if (!Number.isNaN(t) && !content.postDateId) {
      const end = Date.parse(content.endsAt ?? "");
      busy.push([t, !Number.isNaN(end) && end > t ? end : t + 2 * 3_600_000]);
    }
  }
  return { added, busy };
}

function shape(
  p: PostRow,
  dates: DateRow[],
  ctx: { me: string; authors: Map<string, { name: string; isPublic: boolean }>; added: Set<string>; addedBy?: string[] },
): Omit<ExplorePost, "next" | "freeTag"> {
  const a = ctx.authors.get(p.author_id);
  return {
    id: p.id,
    title: p.title,
    body: p.body,
    imageUrls: (p.image_paths ?? []).map((x) => publicImageUrl(x)).filter((u): u is string => !!u),
    author: { id: p.author_id, name: a?.name ?? "Someone", isPublic: a?.isPublic ?? false },
    audience: p.audience,
    category: p.category,
    sourceUrl: p.source_url,
    createdAt: p.created_at,
    mine: p.author_id === ctx.me,
    dates: dates
      .slice()
      .sort((x, y) => Date.parse(x.starts_at) - Date.parse(y.starts_at))
      .map(
        (d): PostDate => ({
          id: d.id,
          label: d.label,
          startsAt: d.starts_at,
          allDay: d.all_day,
          location: d.location,
          added: ctx.added.has(d.id),
        }),
      ),
    addedBy: ctx.addedBy ?? [],
  };
}

export interface ExploreQuery {
  scope: Scope;
  /** Only things at times the viewer has nothing on. */
  free?: boolean;
  category?: string;
  friendsOnly?: boolean;
  q?: string;
}

/**
 * Explore: posts with a date inside the chosen window, soonest first. Bounded by
 * the window, so there's always an end. Empty before migration 0046.
 */
export async function listExplore(query: ExploreQuery): Promise<{ posts: ExplorePost[]; canPostPublic: boolean }> {
  const actor = await getActor();
  if (!actor) return { posts: [], canPostPublic: false };
  const me = actor.actorId;
  const admin = createAdminClient();
  const tz = await serverTimeZone();
  const { from, to } = scopeWindow(query.scope, tz);

  const { data: meRow } = await admin.from("profiles").select("verified").eq("id", me).maybeSingle();
  const canPostPublic = !!meRow?.verified;

  // All-day dates are stored at 09:00 local, so "today" must count from local midnight.
  const dayStart = localMidnightISO(ymd(from, tz), tz);
  const { data: inWindow, error } = await admin
    .from("date_post_dates")
    .select("post_id")
    .gte("starts_at", dayStart)
    .lt("starts_at", to)
    .limit(2000);
  if (error || !inWindow?.length) return { posts: [], canPostPublic };
  const postIds = [...new Set(inWindow.map((d) => d.post_id as string))];

  const [{ data: postRows }, { data: dateRows }, friends, cal] = await Promise.all([
    admin.from("date_posts").select("*").in("id", postIds),
    admin.from("date_post_dates").select("*").in("post_id", postIds),
    friendIdSet(admin, me),
    myCalendar(admin, me),
  ]);
  const q = query.q?.trim().toLowerCase() ?? "";
  let posts = ((postRows ?? []) as PostRow[]).filter((p) => visible(p, me, friends));
  if (query.friendsOnly) posts = posts.filter((p) => friends.has(p.author_id));
  if (query.category && (CATEGORIES as readonly string[]).includes(query.category))
    posts = posts.filter((p) => p.category === query.category);
  const datesBy = new Map<string, DateRow[]>();
  for (const d of (dateRows ?? []) as DateRow[]) datesBy.set(d.post_id, [...(datesBy.get(d.post_id) ?? []), d]);
  if (q) {
    posts = posts.filter(
      (p) =>
        `${p.title} ${p.body ?? ""}`.toLowerCase().includes(q) ||
        (datesBy.get(p.id) ?? []).some((d) => `${d.label} ${d.location ?? ""}`.toLowerCase().includes(q)),
    );
  }
  if (posts.length === 0) return { posts: [], canPostPublic };

  // Which friends added something from each post.
  const addedBy = new Map<string, Set<string>>();
  if (friends.size) {
    const { data: theirs } = await admin
      .from("cards")
      .select("user_id, content")
      .eq("type", "calendar_radar")
      .eq("status", "accepted")
      .in("user_id", [...friends])
      .in(
        "content->>postId",
        posts.map((p) => p.id),
      );
    for (const c of theirs ?? []) {
      const pid = ((c.content ?? {}) as Record<string, string>).postId;
      if (!pid) continue;
      addedBy.set(pid, (addedBy.get(pid) ?? new Set<string>()).add(c.user_id as string));
    }
  }
  const authors = await authorsFor(admin, [
    ...new Set([...posts.map((p) => p.author_id), ...[...addedBy.values()].flatMap((s) => [...s])]),
  ]);

  const a = Date.parse(from);
  const b = Date.parse(to);
  const TWO_H = 2 * 3_600_000;
  const lower = Date.parse(dayStart);
  const busyDays = new Set(cal.busy.map(([t]) => ymd(new Date(t).toISOString(), tz)));
  const isFree = (d: PostDate) => {
    const t = Date.parse(d.startsAt);
    // Timed: assume it takes about two hours and check it against each plan's span.
    return d.allDay ? !busyDays.has(ymd(d.startsAt, tz)) : !cal.busy.some(([s, e]) => t < e && t + TWO_H > s);
  };

  const out: ExplorePost[] = [];
  for (const p of posts) {
    const base = shape(p, datesBy.get(p.id) ?? [], {
      me,
      authors,
      added: cal.added,
      addedBy: [...(addedBy.get(p.id) ?? [])].map((id) => authors.get(id)?.name ?? "A friend"),
    });
    const within = base.dates.filter((d) => {
      const t = Date.parse(d.startsAt);
      return t >= (d.allDay ? lower : a) && t < b;
    });
    if (within.length === 0) continue;
    const freeOne = within.find(isFree) ?? null;
    if (query.free && !freeOne) continue;
    const next = (query.free ? freeOne : within[0]) ?? within[0];
    out.push({
      ...base,
      next,
      freeTag: freeOne
        ? `You're free ${new Date(freeOne.startsAt).toLocaleDateString("en-US", { weekday: "short", timeZone: tz })}`
        : null,
    });
  }
  out.sort((x, y) => Date.parse(x.next!.startsAt) - Date.parse(y.next!.startsAt));
  return { posts: out.slice(0, 100), canPostPublic };
}

/** One post with all its dates, if the viewer may see it. */
export async function getDatePost(id: string): Promise<ExplorePost | null> {
  const actor = await getActor();
  if (!actor || !UUID_RE.test(id)) return null;
  const me = actor.actorId;
  const admin = createAdminClient();
  const { data: p, error } = await admin.from("date_posts").select("*").eq("id", id).maybeSingle();
  if (error || !p) return null;
  const post = p as PostRow;
  const friends = await friendIdSet(admin, me);
  if (!visible(post, me, friends)) return null;
  const [{ data: dates }, authors, cal] = await Promise.all([
    admin.from("date_post_dates").select("*").eq("post_id", id),
    authorsFor(admin, [post.author_id]),
    myCalendar(admin, me),
  ]);
  return { ...shape(post, (dates ?? []) as DateRow[], { me, authors, added: cal.added }), next: null, freeTag: null };
}

/** Pull dates out of a post's text (nothing is saved). */
export async function findDatesInText(
  text: string,
): Promise<{ ok: boolean; dates?: { label: string; startsAt: string; allDay: boolean; location?: string }[]; error?: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const tz = await serverTimeZone();
  const res = await guardedParse(actor.actorId, text, { tz, multiple: true, list: true });
  if (!res.ok) return { ok: false, error: res.error };
  const dates = res.events
    .filter((e) => e.startsAt)
    .map((e) => ({ label: e.title, startsAt: e.startsAt as string, allDay: !e.hasTime, location: e.location }));
  if (dates.length === 0) return { ok: false, error: "Couldn't find any dates in that — add them below." };
  return { ok: true, dates };
}

export interface NewDatePost {
  title: string;
  body?: string;
  imagePaths?: string[];
  dates: { label: string; startsAt: string; allDay: boolean; location?: string }[];
  audience: "friends" | "public";
  category?: string;
  sourceUrl?: string;
}

/** Publish a post. It needs at least one date; "public" is for verified accounts. */
export async function createDatePost(input: NewDatePost): Promise<{ ok: boolean; id?: string; error?: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const me = actor.actorId;
  const title = input.title.trim().slice(0, 100);
  if (!title) return { ok: false, error: "Give it a title." };
  const dates = (input.dates ?? [])
    .filter((d) => d.label?.trim() && d.startsAt && !Number.isNaN(Date.parse(d.startsAt)))
    .slice(0, MAX_DATES);
  if (dates.length === 0) return { ok: false, error: "A post needs at least one date." };

  const admin = createAdminClient();
  let audience: "friends" | "public" = "friends";
  if (input.audience === "public") {
    const { data: p } = await admin.from("profiles").select("verified").eq("id", me).maybeSingle();
    if (!p?.verified) return { ok: false, error: "Posting to everyone is for public accounts." };
    audience = "public";
  }
  const { count } = await admin
    .from("date_posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", me)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= POSTS_PER_DAY) return { ok: false, error: "That's a lot of posts today — try again tomorrow." };

  let sourceUrl: string | null = null;
  if (input.sourceUrl?.trim()) {
    try {
      const u = new URL(/^https?:\/\//i.test(input.sourceUrl.trim()) ? input.sourceUrl.trim() : `https://${input.sourceUrl.trim()}`);
      if (u.protocol === "https:" || u.protocol === "http:") sourceUrl = u.toString().slice(0, 500);
    } catch {
      return { ok: false, error: "That link doesn't look right." };
    }
  }
  // Images must be the author's own uploads.
  const images = (input.imagePaths ?? []).filter((p) => p.startsWith(`${actor.userId}/`) && !p.includes("..")).slice(0, MAX_IMAGES);

  const { data: post, error } = await admin
    .from("date_posts")
    .insert({
      author_id: me,
      title,
      body: input.body?.trim().slice(0, 2000) || null,
      image_paths: images,
      audience,
      category: (CATEGORIES as readonly string[]).includes(input.category ?? "") ? input.category : null,
      source_url: sourceUrl,
    })
    .select("id")
    .single();
  if (error || !post) return { ok: false, error: /date_posts/.test(error?.message ?? "") ? NEEDS_0046 : (error?.message ?? "Couldn't post.") };
  const { error: dErr } = await admin.from("date_post_dates").insert(
    dates.map((d) => ({
      post_id: post.id,
      label: d.label.trim().slice(0, 100),
      starts_at: new Date(d.startsAt).toISOString(),
      all_day: !!d.allDay,
      location: d.location?.trim().slice(0, 120) || null,
    })),
  );
  if (dErr) {
    await admin.from("date_posts").delete().eq("id", post.id);
    return { ok: false, error: dErr.message };
  }
  revalidatePath("/today");
  return { ok: true, id: post.id as string };
}

/** Put some (or all) of a post's dates on the caller's calendar. Already-added ones are skipped. */
export async function addPostDates(postId: string, dateIds: string[]): Promise<{ ok: boolean; added?: number; error?: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const me = actor.actorId;
  const post = await getDatePost(postId);
  if (!post) return { ok: false, error: "That post isn't available." };
  const want = new Set(dateIds);
  const picks = post.dates.filter((d) => want.has(d.id) && !d.added);
  if (picks.length === 0) return { ok: true, added: 0 };
  const tz = await serverTimeZone();
  const admin = createAdminClient();
  const { error } = await admin.from("cards").insert(
    picks.map((d) => {
      const content: Record<string, string> = {
        time: formatWhen(d.startsAt, tz, !d.allDay),
        startsAt: d.startsAt,
        details: post.title,
        fromName: post.author.name,
        postId: post.id,
        postDateId: d.id,
      };
      if (d.location) content.location = d.location;
      if (post.sourceUrl) content.sourceUrl = post.sourceUrl;
      return { user_id: me, sender_id: null, type: "calendar_radar", title: d.label, content, status: "accepted" };
    }),
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/calendar");
  revalidatePath("/today");
  return { ok: true, added: picks.length };
}

/** Delete your own post. Dates people already added stay on their calendars. */
export async function deleteDatePost(id: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await getActor();
  if (!actor || !UUID_RE.test(id)) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { error } = await admin.from("date_posts").delete().eq("id", id).eq("author_id", actor.actorId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/today");
  return { ok: true };
}
