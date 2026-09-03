"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { normalizeUsername } from "@/lib/username";
import type {
  FriendOption,
  FriendEntry,
  FriendRequestEntry,
  FriendState,
  FriendResult,
} from "@/lib/friends";

type Admin = ReturnType<typeof createAdminClient>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nameFromEmail(email: string): string {
  const local = (email ?? "").split("@")[0] ?? "";
  return local || "Someone";
}

interface Prof {
  id: string;
  username: string | null;
  email: string | null;
}

/** Resolve a @handle / email / profile id to a profile. */
async function resolveProfile(admin: Admin, raw: string): Promise<Prof | null> {
  const q = raw.trim().replace(/^@/, "");
  if (!q) return null;
  if (UUID_RE.test(q)) {
    const { data } = await admin.from("profiles").select("id, username, email").eq("id", q).maybeSingle();
    if (data) return data as Prof;
  }
  const uname = normalizeUsername(q);
  const { data: byName } = await admin
    .from("profiles")
    .select("id, username, email")
    .ilike("username", uname)
    .maybeSingle();
  if (byName) return byName as Prof;
  if (q.includes("@")) {
    const { data: byEmail } = await admin
      .from("profiles")
      .select("id, username, email")
      .ilike("email", q.toLowerCase())
      .maybeSingle();
    if (byEmail) return byEmail as Prof;
  }
  return null;
}

async function profilesByIds(admin: Admin, ids: string[]): Promise<Map<string, Prof>> {
  const map = new Map<string, Prof>();
  if (ids.length === 0) return map;
  const { data } = await admin.from("profiles").select("id, username, email").in("id", ids);
  for (const p of data ?? []) map.set(p.id as string, p as Prof);
  return map;
}

function entryOf(p: Prof | undefined, id: string): FriendEntry {
  const username = p?.username ?? "";
  const email = p?.email ?? "";
  return { id, username, email, name: username || nameFromEmail(email) };
}

/** The other id in a friendship row, from the viewer's perspective. */
function otherId(row: { requester_id: string; addressee_id: string }, me: string): string {
  return row.requester_id === me ? row.addressee_id : row.requester_id;
}

/** Profile ids the given profile is ACCEPTED friends with. */
async function friendIds(admin: Admin, id: string): Promise<string[]> {
  const { data } = await admin
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${id},addressee_id.eq.${id}`);
  return (data ?? []).map((r) => otherId(r as { requester_id: string; addressee_id: string }, id));
}

/**
 * Send a friend request (by @handle, email, or id). Idempotent:
 * - already friends / already requested → no-op ok
 * - they already requested you → auto-accept (you become friends)
 * - otherwise create a pending request
 */
export async function addFriend(handleOrId: string): Promise<FriendResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const me = actor.actorId;
  const admin = createAdminClient();
  const target = await resolveProfile(admin, handleOrId);
  if (!target) return { ok: false, error: `No one on the app matches "${handleOrId.trim()}".`, notFound: true };
  if (target.id === me) return { ok: false, error: "That's you!" };

  const [{ data: mine }, { data: theirs }] = await Promise.all([
    admin.from("friendships").select("status").eq("requester_id", me).eq("addressee_id", target.id).maybeSingle(),
    admin.from("friendships").select("status").eq("requester_id", target.id).eq("addressee_id", me).maybeSingle(),
  ]);

  if (mine?.status === "accepted" || theirs?.status === "accepted") return { ok: true, status: "friends" };
  if (mine?.status === "pending") return { ok: true, status: "outgoing" };

  if (theirs?.status === "pending") {
    // They already asked — accept it instead of sending a mirror request.
    const { error } = await admin
      .from("friendships")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("requester_id", target.id)
      .eq("addressee_id", me);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/me");
    revalidatePath(`/u/${target.id}`);
    return { ok: true, status: "friends" };
  }

  const { error } = await admin
    .from("friendships")
    .insert({ requester_id: me, addressee_id: target.id, status: "pending" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  revalidatePath(`/u/${target.id}`);
  return { ok: true, status: "outgoing" };
}

/** Accept an incoming request from `requesterId`. */
export async function acceptFriend(requesterId: string): Promise<FriendResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("requester_id", requesterId)
    .eq("addressee_id", actor.actorId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  revalidatePath(`/u/${requesterId}`);
  return { ok: true, status: "friends" };
}

/** Decline an incoming request from `requesterId` (delete it). */
export async function declineFriend(requesterId: string): Promise<FriendResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("friendships")
    .delete()
    .eq("requester_id", requesterId)
    .eq("addressee_id", actor.actorId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  revalidatePath(`/u/${requesterId}`);
  return { ok: true, status: "none" };
}

/** Cancel a request you sent to `targetId`. */
export async function cancelRequest(targetId: string): Promise<FriendResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("friendships")
    .delete()
    .eq("requester_id", actor.actorId)
    .eq("addressee_id", targetId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  revalidatePath(`/u/${targetId}`);
  return { ok: true, status: "none" };
}

/** Unfriend `otherId` (delete the accepted row, either direction). */
export async function unfriend(other: string): Promise<FriendResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const me = actor.actorId;
  const admin = createAdminClient();
  const { error } = await admin
    .from("friendships")
    .delete()
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${me})`,
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  revalidatePath(`/u/${other}`);
  return { ok: true, status: "none" };
}

/** Your accepted friends, as list rows. */
export async function listFriends(): Promise<FriendEntry[]> {
  const actor = await getActor();
  if (!actor) return [];
  const me = actor.actorId;
  const admin = createAdminClient();
  const { data } = await admin
    .from("friendships")
    .select("requester_id, addressee_id, responded_at")
    .eq("status", "accepted")
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
    .order("responded_at", { ascending: false });
  const ids = (data ?? []).map((r) => otherId(r as { requester_id: string; addressee_id: string }, me));
  const profs = await profilesByIds(admin, ids);
  return ids.map((id) => entryOf(profs.get(id), id));
}

/** Your accepted friends as pickable recipient options (username required). */
export async function listFriendOptions(): Promise<FriendOption[]> {
  const friends = await listFriends();
  return friends
    .filter((f) => f.username)
    .map((f) => ({ id: f.id, username: f.username, email: f.email }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

/** Incoming friend requests awaiting your response. */
export async function listIncomingRequests(): Promise<FriendRequestEntry[]> {
  const actor = await getActor();
  if (!actor) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("friendships")
    .select("requester_id, created_at")
    .eq("addressee_id", actor.actorId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const ids = (data ?? []).map((r) => r.requester_id as string);
  const profs = await profilesByIds(admin, ids);
  return ids.map((id) => entryOf(profs.get(id), id));
}

/** How many friend requests are waiting on you (the nav badge). Resilient to a
 *  not-yet-applied 0036 (returns 0 on error). */
export async function pendingRequestCount(): Promise<number> {
  const actor = await getActor();
  if (!actor) return 0;
  const admin = createAdminClient();
  try {
    const { count, error } = await admin
      .from("friendships")
      .select("requester_id", { count: "exact", head: true })
      .eq("addressee_id", actor.actorId)
      .eq("status", "pending");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Friends you and `targetId` have in common (for the profile's mutual line). */
export async function mutualFriends(targetId: string, limit = 8): Promise<FriendEntry[]> {
  const actor = await getActor();
  if (!actor || actor.actorId === targetId) return [];
  const admin = createAdminClient();
  const [mine, theirs] = await Promise.all([friendIds(admin, actor.actorId), friendIds(admin, targetId)]);
  const theirSet = new Set(theirs);
  const commonIds = mine.filter((id) => theirSet.has(id)).slice(0, limit);
  const profs = await profilesByIds(admin, commonIds);
  return commonIds.map((id) => entryOf(profs.get(id), id));
}

/** The viewer's friendship status toward one profile (for the profile button). */
export async function getFriendState(targetId: string): Promise<FriendState> {
  const actor = await getActor();
  if (!actor) return { status: "none" };
  const me = actor.actorId;
  if (targetId === me) return { status: "self" };
  const admin = createAdminClient();
  const [{ data: mine }, { data: theirs }] = await Promise.all([
    admin.from("friendships").select("status").eq("requester_id", me).eq("addressee_id", targetId).maybeSingle(),
    admin.from("friendships").select("status").eq("requester_id", targetId).eq("addressee_id", me).maybeSingle(),
  ]);
  if (mine?.status === "accepted" || theirs?.status === "accepted") return { status: "friends" };
  if (mine?.status === "pending") return { status: "outgoing" };
  if (theirs?.status === "pending") return { status: "incoming" };
  return { status: "none" };
}
