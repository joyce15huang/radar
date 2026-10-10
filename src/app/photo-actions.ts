"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";

const NEEDS_0040 = "Likes, comments and grid pins need the 0040 database update — run it in Supabase.";
const missingTable = (msg?: string) => !!msg && /post_likes|post_comments|grid_pins|does not exist|schema cache/i.test(msg);

function handleOf(p: { username: string | null; email: string | null } | undefined): string {
  if (p?.username) return p.username;
  return (p?.email ?? "").split("@")[0] || "someone";
}

/* --------------------------------- grid pins -------------------------------- */

export interface PinResult {
  ok: boolean;
  added?: number;
  error?: string;
}

/**
 * Put event photos on YOUR profile grid. Each item is one image of a post. You
 * can pin your own photos, or any photo from an event you're on.
 */
export async function addToGrid(items: { postId: string; index: number }[]): Promise<PinResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const me = actor.actorId;
  const clean = items.filter((i) => i.postId && Number.isInteger(i.index) && i.index >= 0).slice(0, 30);
  if (clean.length === 0) return { ok: false, error: "Pick at least one photo." };
  const admin = createAdminClient();

  const ids = [...new Set(clean.map((i) => i.postId))];
  const { data: posts } = await admin.from("posts").select("id, author_id, event_id").in("id", ids);
  const byId = new Map((posts ?? []).map((p) => [p.id as string, p as { author_id: string; event_id: string | null }]));

  // Events you're on (host or holding a card), for photos taken by others.
  const eventIds = [...new Set((posts ?? []).map((p) => p.event_id as string | null).filter(Boolean))] as string[];
  const onEvent = new Set<string>();
  if (eventIds.length) {
    const [{ data: cards }, { data: hosted }] = await Promise.all([
      admin.from("cards").select("event_id").eq("user_id", me).in("event_id", eventIds),
      admin.from("events").select("id").eq("creator_id", me).in("id", eventIds),
    ]);
    for (const c of cards ?? []) onEvent.add(c.event_id as string);
    for (const e of hosted ?? []) onEvent.add(e.id as string);
  }

  const rows = clean
    .filter((i) => {
      const p = byId.get(i.postId);
      return p && (p.author_id === me || (p.event_id && onEvent.has(p.event_id)));
    })
    .map((i) => ({ user_id: me, post_id: i.postId, image_index: i.index }));
  if (rows.length === 0) return { ok: false, error: "Those photos aren't yours to add." };

  const { error } = await admin
    .from("grid_pins")
    .upsert(rows, { onConflict: "user_id,post_id,image_index", ignoreDuplicates: true });
  if (error) return { ok: false, error: missingTable(error.message) ? NEEDS_0040 : error.message };
  revalidatePath("/me");
  return { ok: true, added: rows.length };
}

export async function removeFromGrid(pinId: string): Promise<{ ok: boolean }> {
  const actor = await getActor();
  if (!actor) return { ok: false };
  const admin = createAdminClient();
  await admin.from("grid_pins").delete().eq("id", pinId).eq("user_id", actor.actorId);
  revalidatePath("/me");
  return { ok: true };
}

/* ----------------------------- likes + comments ----------------------------- */

export interface PostComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface PostSocial {
  likes: number;
  liked: boolean;
  comments: PostComment[];
  /** False until the 0040 tables exist. */
  available: boolean;
}

export async function getPostSocial(postId: string): Promise<PostSocial> {
  const empty: PostSocial = { likes: 0, liked: false, comments: [], available: false };
  const actor = await getActor();
  if (!actor || !postId) return empty;
  const admin = createAdminClient();
  const [likes, mine, comments] = await Promise.all([
    admin.from("post_likes").select("user_id", { count: "exact", head: true }).eq("post_id", postId),
    admin.from("post_likes").select("user_id").eq("post_id", postId).eq("user_id", actor.actorId).limit(1),
    admin
      .from("post_comments")
      .select("id, author_id, body, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);
  if (likes.error || comments.error) return empty;

  const authorIds = [...new Set((comments.data ?? []).map((c) => c.author_id as string))];
  const { data: profs } = authorIds.length
    ? await admin.from("profiles").select("id, username, email").in("id", authorIds)
    : { data: [] };
  const names = new Map((profs ?? []).map((p) => [p.id as string, handleOf(p as { username: string | null; email: string | null })]));

  return {
    available: true,
    likes: likes.count ?? 0,
    liked: (mine.data ?? []).length > 0,
    comments: (comments.data ?? []).map((c) => ({
      id: c.id as string,
      author: names.get(c.author_id as string) ?? "someone",
      body: c.body as string,
      createdAt: c.created_at as string,
      mine: c.author_id === actor.actorId,
    })),
  };
}

export async function toggleLike(postId: string): Promise<{ ok: boolean; liked?: boolean; error?: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("post_likes")
    .select("user_id")
    .eq("post_id", postId)
    .eq("user_id", actor.actorId)
    .limit(1);
  if (readErr) return { ok: false, error: missingTable(readErr.message) ? NEEDS_0040 : readErr.message };
  if (existing?.length) {
    await admin.from("post_likes").delete().eq("post_id", postId).eq("user_id", actor.actorId);
    return { ok: true, liked: false };
  }
  const { error } = await admin.from("post_likes").insert({ post_id: postId, user_id: actor.actorId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, liked: true };
}

export async function addComment(postId: string, body: string): Promise<{ ok: boolean; comment?: PostComment; error?: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const text = body.trim().slice(0, 1000);
  if (!text) return { ok: false, error: "Write something first." };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("post_comments")
    .insert({ post_id: postId, author_id: actor.actorId, body: text })
    .select("id, created_at")
    .single();
  if (error || !data) return { ok: false, error: missingTable(error?.message) ? NEEDS_0040 : error?.message ?? "Couldn't post that." };
  return {
    ok: true,
    comment: {
      id: data.id as string,
      author: actor.activeProfile.username ?? actor.userEmail?.split("@")[0] ?? "you",
      body: text,
      createdAt: data.created_at as string,
      mine: true,
    },
  };
}

export async function deleteComment(id: string): Promise<{ ok: boolean }> {
  const actor = await getActor();
  if (!actor) return { ok: false };
  const admin = createAdminClient();
  await admin.from("post_comments").delete().eq("id", id).eq("author_id", actor.actorId);
  return { ok: true };
}
