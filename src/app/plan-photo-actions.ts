"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { publicImageUrl } from "@/lib/storage";

export interface PastPlan {
  id: string;
  title: string;
  when: string;
  startsAt: string;
  hosted: boolean;
  went: number;
  photoCount: number;
  coverUrl: string | null;
  /** The viewer is on this plan, so its page opens for them. */
  canOpen: boolean;
}

interface EvRow {
  id: string;
  creator_id: string;
  title: string | null;
  event_time: string | null;
  starts_at: string | null;
  is_broadcast?: boolean | null;
  canceled_at?: string | null;
  source_url?: string | null;
}

/**
 * Someone's past plans for their profile: ones they hosted or went to, newest
 * first, each with its photo count and a cover. On your own profile you see all
 * of them; on someone else's, only plans you were on too, plus their public ones.
 */
export async function listPastPlans(profileId: string): Promise<PastPlan[]> {
  const actor = await getActor();
  if (!actor || !profileId) return [];
  const me = actor.actorId;
  const admin = createAdminClient();

  const [{ data: hostedRows }, { data: wentCards }] = await Promise.all([
    admin.from("events").select("*").eq("creator_id", profileId),
    admin
      .from("cards")
      .select("event_id")
      .eq("user_id", profileId)
      .eq("type", "social_invite")
      .eq("status", "accepted")
      .not("event_id", "is", null),
  ]);
  const hosted = (hostedRows ?? []) as EvRow[];
  const have = new Set(hosted.map((e) => e.id));
  const otherIds = [...new Set((wentCards ?? []).map((c) => c.event_id as string))].filter((id) => !have.has(id));
  let others: EvRow[] = [];
  if (otherIds.length) {
    const { data } = await admin.from("events").select("*").in("id", otherIds);
    others = (data ?? []) as EvRow[];
  }

  const now = Date.now();
  let events = [...hosted, ...others].filter((e) => {
    const t = Date.parse(e.starts_at ?? "");
    return !Number.isNaN(t) && t < now && !e.canceled_at;
  });
  if (events.length === 0) return [];

  // Which of these is the viewer on?
  const ids = events.map((e) => e.id);
  const mine = new Set<string>(events.filter((e) => e.creator_id === me).map((e) => e.id));
  const { data: myCards } = await admin
    .from("cards")
    .select("event_id")
    .eq("user_id", me)
    .eq("type", "social_invite")
    .eq("status", "accepted")
    .in("event_id", ids);
  for (const c of myCards ?? []) mine.add(c.event_id as string);
  // Someone else's profile: plans you both went to, plus public events THEY hosted.
  if (profileId !== me) events = events.filter((e) => mine.has(e.id) || (e.is_broadcast && e.creator_id === profileId));
  if (events.length === 0) return [];

  const shownIds = events.map((e) => e.id);
  const [{ data: posts }, { data: going }] = await Promise.all([
    admin
      .from("posts")
      .select("event_id, image_path, image_paths, created_at")
      .in("event_id", shownIds)
      .order("created_at", { ascending: false }),
    admin.from("cards").select("event_id, user_id").eq("type", "social_invite").eq("status", "accepted").in("event_id", shownIds),
  ]);
  const photos = new Map<string, { count: number; cover: string | null }>();
  for (const p of posts ?? []) {
    const paths = (p.image_paths as string[] | null)?.length
      ? (p.image_paths as string[])
      : p.image_path
        ? [p.image_path as string]
        : [];
    const cur = photos.get(p.event_id as string) ?? { count: 0, cover: null };
    cur.count += paths.length;
    if (!cur.cover && paths[0]) cur.cover = publicImageUrl(paths[0]);
    photos.set(p.event_id as string, cur);
  }
  const went = new Map<string, Set<string>>();
  for (const g of going ?? []) {
    const s = went.get(g.event_id as string) ?? new Set<string>();
    s.add(g.user_id as string);
    went.set(g.event_id as string, s);
  }

  const sourced = new Set(events.filter((e) => !!e.source_url).map((e) => e.id));
  return events
    .map((e) => ({
      id: e.id,
      title: e.title ?? "Plan",
      when: e.event_time ?? "",
      startsAt: e.starts_at as string,
      hosted: e.creator_id === profileId,
      went: went.get(e.id)?.size ?? 0,
      photoCount: photos.get(e.id)?.count ?? 0,
      coverUrl: photos.get(e.id)?.cover ?? null,
      canOpen: mine.has(e.id),
    }))
    // A web find you saved for yourself isn't a plan you went on — unless it has photos or company.
    .filter((p) => !(p.photoCount === 0 && p.went <= 1 && sourced.has(p.id)))
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
    .slice(0, 80);
}

export interface PlanSpan {
  id: string;
  title: string;
  startsAt: string;
  /** End (ISO) when the plan has one — multi-day trips. */
  endsAt: string | null;
}

/** Plans on the caller's calendar that start within [startISO, endISO) — for matching photos to plans by date. */
export async function listMyPlansBetween(startISO: string, endISO: string): Promise<PlanSpan[]> {
  const actor = await getActor();
  if (!actor) return [];
  const a = Date.parse(startISO);
  const b = Date.parse(endISO);
  if (Number.isNaN(a) || Number.isNaN(b)) return [];
  const admin = createAdminClient();
  const { data: cards } = await admin
    .from("cards")
    .select("event_id, content")
    .eq("user_id", actor.actorId)
    .eq("type", "social_invite")
    .eq("status", "accepted")
    .not("event_id", "is", null);
  const endBy = new Map<string, string | null>();
  for (const c of cards ?? []) {
    endBy.set(c.event_id as string, ((c.content ?? {}) as Record<string, string | null>).endsAt ?? null);
  }
  const ids = [...endBy.keys()];
  if (ids.length === 0) return [];
  const { data: evs } = await admin.from("events").select("*").in("id", ids);
  return ((evs ?? []) as EvRow[])
    .filter((e) => {
      const t = Date.parse(e.starts_at ?? "");
      if (Number.isNaN(t) || e.canceled_at) return false;
      const end = Date.parse(endBy.get(e.id) ?? "");
      // Overlaps the window (a trip that started before it still counts).
      return t < b && (Number.isNaN(end) ? t : end) >= a;
    })
    .map((e) => ({ id: e.id, title: e.title ?? "Plan", startsAt: e.starts_at as string, endsAt: endBy.get(e.id) ?? null }));
}
