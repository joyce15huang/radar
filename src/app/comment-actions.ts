"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";

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

async function onGuestList(admin: Admin, eventId: string, actorId: string): Promise<boolean> {
  const { data: ev } = await admin.from("events").select("creator_id").eq("id", eventId).maybeSingle();
  if ((ev?.creator_id as string | undefined) === actorId) return true;
  const { data: mine } = await admin
    .from("cards")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", actorId)
    .limit(1);
  return !!mine && mine.length > 0;
}

export interface EventComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
}

export async function listComments(eventId: string): Promise<EventComment[]> {
  const actor = await getActor();
  if (!actor) return [];
  const admin = createAdminClient();
  if (!(await onGuestList(admin, eventId, actor.actorId))) return [];

  const { data: rows } = await admin
    .from("event_comments")
    .select("id, author_id, body, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  const comments = rows ?? [];

  const ids = [...new Set(comments.map((c) => c.author_id as string))];
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await admin.from("profiles").select("id, username, email").in("id", ids);
    for (const p of profs ?? []) {
      const username = (p.username as string) || "";
      const email = (p.email as string) || "";
      nameById.set(p.id as string, username ? `@${username}` : nameFromEmail(email));
    }
  }

  return comments.map((c) => ({
    id: c.id as string,
    authorId: c.author_id as string,
    authorName: nameById.get(c.author_id as string) ?? "Someone",
    body: c.body as string,
    createdAt: c.created_at as string,
    isMine: c.author_id === actor.actorId,
  }));
}

export interface CommentResult {
  ok: boolean;
  error?: string;
}

export async function addComment(eventId: string, body: string): Promise<CommentResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  if (!(await onGuestList(admin, eventId, actor.actorId))) return { ok: false, error: "You're not on this event." };
  const clean = body.trim();
  if (!clean) return { ok: false, error: "Write something first." };
  if (clean.length > 2000) return { ok: false, error: "That's too long." };
  const { error } = await admin
    .from("event_comments")
    .insert({ event_id: eventId, author_id: actor.actorId, body: clean });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/event/${eventId}`);
  return { ok: true };
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
  if (!c) return { ok: false, error: "That comment is gone." };
  if (c.author_id !== actor.actorId) return { ok: false, error: "Only the author can delete it." };
  await admin.from("event_comments").delete().eq("id", commentId);
  revalidatePath(`/event/${c.event_id as string}`);
  return { ok: true };
}
