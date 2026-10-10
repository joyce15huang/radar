"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { friendIdSet } from "@/lib/friendIds";

export interface InboxInvite {
  cardId: string;
  eventId: string | null;
  senderId: string;
  /** "@username" (or a name from their email). */
  senderName: string;
  /** Sender is your friend → full details; otherwise it's just "an event invite". */
  isFriend: boolean;
  title?: string;
  when?: string;
  location?: string;
  createdAt: string;
}

function nameOf(p: { username: string | null; email: string | null } | undefined): string {
  if (p?.username) return `@${p.username}`;
  const local = (p?.email ?? "").split("@")[0];
  return local || "Someone";
}

/** Personal event invites waiting on you (newest first). Strangers' invites carry no details. */
export async function listInboxInvites(): Promise<InboxInvite[]> {
  const actor = await getActor();
  if (!actor) return [];
  const me = actor.actorId;
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("cards")
    .select("id, title, content, sender_id, event_id, created_at")
    .eq("user_id", me)
    .eq("type", "social_invite")
    .eq("status", "pending")
    .not("sender_id", "is", null)
    .neq("sender_id", me)
    .order("created_at", { ascending: false })
    .limit(50);
  const invites = (rows ?? []).filter((r) => (r.content as Record<string, string> | null)?.broadcast !== "true");
  if (invites.length === 0) return [];

  const senderIds = [...new Set(invites.map((r) => r.sender_id as string))];
  const [friends, { data: profs }] = await Promise.all([
    friendIdSet(admin, me),
    admin.from("profiles").select("id, username, email").in("id", senderIds),
  ]);
  const byId = new Map((profs ?? []).map((p) => [p.id as string, p as { username: string | null; email: string | null }]));

  return invites.map((r) => {
    const senderId = r.sender_id as string;
    const isFriend = friends.has(senderId);
    const c = (r.content ?? {}) as Record<string, string | null>;
    return {
      cardId: r.id as string,
      eventId: (r.event_id as string | null) ?? null,
      senderId,
      senderName: nameOf(byId.get(senderId)),
      isFriend,
      // Only friends' invites reveal what the event is.
      ...(isFriend
        ? { title: (r.title as string) ?? undefined, when: c.eventTime ?? undefined, location: c.location ?? undefined }
        : {}),
      createdAt: r.created_at as string,
    };
  });
}

/** Badge count for the Inbox tab: pending personal invites + incoming friend requests. */
export async function inboxCount(): Promise<number> {
  const actor = await getActor();
  if (!actor) return 0;
  const me = actor.actorId;
  const admin = createAdminClient();
  try {
    const [{ data: inv }, { count: reqs }] = await Promise.all([
      admin
        .from("cards")
        .select("content")
        .eq("user_id", me)
        .eq("type", "social_invite")
        .eq("status", "pending")
        .not("sender_id", "is", null)
        .neq("sender_id", me)
        .limit(100),
      admin
        .from("friendships")
        .select("requester_id", { count: "exact", head: true })
        .eq("addressee_id", me)
        .eq("status", "pending"),
    ]);
    const invites = (inv ?? []).filter((r) => (r.content as Record<string, string> | null)?.broadcast !== "true").length;
    return invites + (reqs ?? 0);
  } catch {
    return 0;
  }
}

/** Accept (→ on your calendar) or decline an event invite. */
export async function respondToInvite(cardId: string, accept: boolean): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const { data, error } = await actor.supabase
    .from("cards")
    .update({ status: accept ? "accepted" : "dismissed" })
    .eq("id", cardId)
    .eq("user_id", actor.actorId)
    .select("event_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  revalidatePath("/calendar");
  revalidatePath("/today");
  return { ok: true, eventId: (data?.event_id as string | null) ?? undefined };
}
