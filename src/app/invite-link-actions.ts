"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { eventForCode } from "@/lib/inviteLinks";

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 7 chars from a 56-symbol alphabet (no 0/O/1/l/I) ≈ 1.7e12 codes. */
function newCode(): string {
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

async function siteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export interface InviteLinkResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * The event's short invite link, creating its code on first use. Same rule as
 * inviting: the host always; a guest only when the host allows guests to invite.
 */
export async function getInviteLink(eventId: string): Promise<InviteLinkResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();

  const { data: ev, error } = await admin
    .from("events")
    .select("id, creator_id, allow_reinvite, invite_code")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      error: /invite_code/.test(error.message)
        ? "Invite links need the 0037 database update — run it in Supabase."
        : error.message,
    };
  }
  if (!ev) return { ok: false, error: "That event no longer exists." };

  if (ev.creator_id !== actor.actorId) {
    if (!ev.allow_reinvite) return { ok: false, error: "Only the host can share this event." };
    const { data: mine } = await admin
      .from("cards")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", actor.actorId)
      .limit(1);
    if (!mine?.length) return { ok: false, error: "Only people on the guest list can share it." };
  }

  let code = ev.invite_code as string | null;
  for (let i = 0; !code && i < 4; i++) {
    const candidate = newCode();
    const { data: set } = await admin
      .from("events")
      .update({ invite_code: candidate })
      .eq("id", eventId)
      .is("invite_code", null)
      .select("invite_code")
      .maybeSingle();
    if (set?.invite_code) code = set.invite_code as string;
    else {
      // Lost a race (someone else set it) or hit a rare collision — re-read.
      const { data: again } = await admin.from("events").select("invite_code").eq("id", eventId).maybeSingle();
      code = (again?.invite_code as string | null) ?? null;
    }
  }
  if (!code) return { ok: false, error: "Couldn't create a link. Try again." };

  return { ok: true, url: `${await siteOrigin()}/i/${code}` };
}

/**
 * Join an event from its invite link: puts it on your calendar as "going" and
 * makes you friends with the host (so they can invite you directly next time).
 */
export async function joinViaInvite(code: string): Promise<void> {
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(`/i/${code}`)}`);
  const me = actor.actorId;
  const admin = createAdminClient();

  const ev = await eventForCode(admin, code);
  if (!ev) redirect("/calendar");
  if (ev.creator_id === me) redirect(`/event/${ev.id}`);

  const { data: existing } = await admin
    .from("cards")
    .select("id, status")
    .eq("event_id", ev.id)
    .eq("user_id", me)
    .limit(1);

  if (existing?.length) {
    if (existing[0].status !== "accepted") {
      await admin.from("cards").update({ status: "accepted" }).eq("id", existing[0].id);
    }
  } else {
    // Copy the host's own (canonical) card content so every attendee sees the same details.
    const { data: hostCard } = await admin
      .from("cards")
      .select("title, content")
      .eq("event_id", ev.id)
      .eq("user_id", ev.creator_id)
      .limit(1)
      .maybeSingle();
    const content = { ...((hostCard?.content ?? {}) as Record<string, string>) };
    await admin.from("cards").insert({
      user_id: me,
      sender_id: ev.creator_id,
      type: "social_invite",
      title: hostCard?.title ?? ev.title,
      content,
      status: "accepted",
      event_id: ev.id,
    });
  }

  // Friends with the host, unless already connected in either direction.
  const { data: rel } = await admin
    .from("friendships")
    .select("id, status")
    .or(
      `and(requester_id.eq.${ev.creator_id},addressee_id.eq.${me}),and(requester_id.eq.${me},addressee_id.eq.${ev.creator_id})`,
    )
    .limit(1);
  if (!rel?.length) {
    await admin.from("friendships").insert({
      requester_id: ev.creator_id,
      addressee_id: me,
      status: "accepted",
      responded_at: new Date().toISOString(),
    });
  } else if (rel[0].status !== "accepted") {
    await admin
      .from("friendships")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", rel[0].id);
  }

  revalidatePath("/calendar");
  redirect(`/event/${ev.id}`);
}
