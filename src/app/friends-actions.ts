"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getActor } from "@/lib/actor";
import type { FriendActionResult, FriendOption } from "@/lib/friends";
import { normalizeUsername } from "@/lib/username";

/**
 * The viewer's accepted friends as pickable options (id + @username + email) for
 * the invite autocomplete. Sorted by username; friends without a username yet are
 * dropped (can't be @-picked).
 */
export async function listMyAcceptedFriends(): Promise<FriendOption[]> {
  const { supabase, actorId } = await getViewer();
  if (!actorId) return [];

  const { data: rels } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .or(`requester_id.eq.${actorId},addressee_id.eq.${actorId}`)
    .eq("status", "accepted");

  const ids = (rels ?? []).map((r) =>
    r.requester_id === actorId ? (r.addressee_id as string) : (r.requester_id as string),
  );
  if (ids.length === 0) return [];

  const { data: profs } = await supabase
    .from("profiles")
    .select("id, username, email")
    .in("id", ids);

  return (profs ?? [])
    .map((p) => ({
      id: p.id as string,
      username: (p.username as string) ?? "",
      email: (p.email as string) ?? "",
    }))
    .filter((f) => f.username)
    .sort((a, b) => a.username.localeCompare(b.username));
}

/** The active persona as the "viewer" for all friendship ops. */
async function getViewer(): Promise<
  { supabase: SupabaseClient; actorId: string } | { supabase: null; actorId: null }
> {
  const actor = await getActor();
  if (!actor) return { supabase: null, actorId: null };
  return { supabase: actor.supabase as unknown as SupabaseClient, actorId: actor.actorId };
}

/** PostgREST `.or()` filter matching a friendships row between two users, either direction. */
function pairFilter(a: string, b: string): string {
  return `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`;
}

/**
 * Look up a user by @username (with an email fallback for convenience) and send
 * — or reconcile — a friend request. Handles the tricky cases for the caller:
 *  - already friends            → friendly error
 *  - request already outgoing   → friendly error
 *  - a reverse request exists   → accept it (both wanted to connect)
 *  - a previously declined row  → revive it as a fresh request from the viewer
 */
export async function sendFriendRequest(rawHandle: string): Promise<FriendActionResult> {
  const raw = rawHandle.trim();
  if (!raw) return { ok: false, error: "Enter a username." };

  const { supabase, actorId } = await getViewer();
  if (!actorId) return { ok: false, error: "You're not signed in." };

  const handle = normalizeUsername(raw);
  const looksLikeEmail = raw.includes("@") && raw.indexOf("@") > 0;

  // Primary: match by username. Fallback: if the input looks like an email, try
  // that too (keeps existing muscle memory working).
  let { data: target, error: lookupErr } = await supabase
    .from("profiles")
    .select("id, username, email")
    .ilike("username", handle)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };

  if (!target && looksLikeEmail) {
    ({ data: target, error: lookupErr } = await supabase
      .from("profiles")
      .select("id, username, email")
      .ilike("email", raw.toLowerCase())
      .maybeSingle());
    if (lookupErr) return { ok: false, error: lookupErr.message };
  }

  if (!target) {
    return { ok: false, error: `No one on the app uses @${handle} yet.`, notFound: true };
  }

  const targetId = target.id as string;
  if (targetId === actorId) return { ok: false, error: "That's you!" };

  const { data: existing, error: existErr } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .or(pairFilter(actorId, targetId))
    .maybeSingle();
  if (existErr) return { ok: false, error: existErr.message };

  if (existing) {
    if (existing.status === "accepted") {
      return { ok: false, error: "You're already friends." };
    }
    if (existing.status === "pending") {
      if (existing.requester_id === actorId) {
        return { ok: false, error: "You've already sent them a request." };
      }
      // They already requested the viewer → accepting closes the loop.
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("addressee_id", actorId);
      if (error) return { ok: false, error: error.message };
      revalidatePath("/friends");
      return { ok: true, autoAccepted: true };
    }
    // status === 'declined' → revive as a fresh request from the viewer.
    const { error } = await supabase
      .from("friendships")
      .update({
        requester_id: actorId,
        addressee_id: targetId,
        status: "pending",
        responded_at: null,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/friends");
    return { ok: true };
  }

  const { error } = await supabase.from("friendships").insert({
    requester_id: actorId,
    addressee_id: targetId,
    status: "pending",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/friends");
  return { ok: true };
}

/** Accept or decline an incoming pending request (viewer must be the addressee). */
export async function respondToRequest(
  friendshipId: string,
  accept: boolean,
): Promise<FriendActionResult> {
  const { supabase, actorId } = await getViewer();
  if (!actorId) return { ok: false, error: "You're not signed in." };

  const { error } = await supabase
    .from("friendships")
    .update({
      status: accept ? "accepted" : "declined",
      responded_at: new Date().toISOString(),
    })
    .eq("id", friendshipId)
    .eq("addressee_id", actorId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/friends");
  return { ok: true };
}

/** Cancel a pending request the viewer sent (viewer must be the requester). */
export async function cancelRequest(friendshipId: string): Promise<FriendActionResult> {
  const { supabase, actorId } = await getViewer();
  if (!actorId) return { ok: false, error: "You're not signed in." };

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .eq("requester_id", actorId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/friends");
  return { ok: true };
}

/** Remove an accepted friendship (either party may do this). */
export async function removeFriend(friendshipId: string): Promise<FriendActionResult> {
  const { supabase, actorId } = await getViewer();
  if (!actorId) return { ok: false, error: "You're not signed in." };

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .or(`requester_id.eq.${actorId},addressee_id.eq.${actorId}`);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/friends");
  return { ok: true };
}
