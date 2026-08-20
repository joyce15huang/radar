"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverTimeZone } from "@/lib/tz";
import { parseEvents, nowContext, type ParsedEvent } from "@/lib/parse/schedule";
import { formatWhen } from "@/lib/localDateTime";
import { getActor } from "@/lib/actor";

export interface PreviewResult {
  ok: boolean;
  event?: ParsedEvent;
  error?: string;
}

/** Parses a free-text event description into a structured event for confirmation. */
export async function parseEventPreview(text: string): Promise<PreviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };
  if (!text.trim()) return { ok: false, error: "Describe the event first." };

  try {
    const tz = await serverTimeZone();
    const events = await parseEvents(text, { nowContext: nowContext(tz), multiple: false });
    if (events.length === 0) {
      return { ok: false, error: "Couldn't find an event in that — try adding a day or time." };
    }
    const ev = events[0];
    const when = ev.startsAt ? formatWhen(ev.startsAt, tz, ev.hasTime) : ev.when;
    return { ok: true, event: { ...ev, when } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Prettify an email local-part: "ada.lovelace" → "Ada Lovelace". */
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

export interface SendResult {
  ok: boolean;
  sent?: number;
  notFound?: string[];
  error?: string;
}

/**
 * Drops a Ping or Invite into one OR MANY friends' decks. For invites it first
 * creates an `events` row so all recipients are attendees of the same event.
 * Runs with the service role to write rows the recipients own.
 */
export async function sendCards(input: {
  type: "social_ping" | "social_invite";
  recipients: string[];
  message?: string;
  link?: string;
  eventTitle?: string;
  eventTime?: string;
  startsAt?: string | null;
  location?: string;
  note?: string;
}): Promise<SendResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const { actorId } = actor;

  const emails = Array.from(
    new Set(input.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  );
  if (emails.length === 0) return { ok: false, error: "Add at least one email." };

  const admin = createAdminClient();
  const { data: profiles, error: lookupErr } = await admin
    .from("profiles")
    .select("id, email")
    .in("email", emails);
  if (lookupErr) return { ok: false, error: lookupErr.message };

  const found = new Map(
    (profiles ?? []).map((p) => [String(p.email).toLowerCase(), p.id as string]),
  );
  const notFound = emails.filter((e) => !found.has(e));
  const recipientIds = emails.filter((e) => found.has(e)).map((e) => found.get(e)!);

  if (recipientIds.length === 0) {
    return { ok: false, error: `No one on the app matched: ${notFound.join(", ")}`, notFound };
  }

  const senderName =
    actor.activeProfile.displayName ||
    actor.activeProfile.username ||
    nameFromEmail(actor.userEmail ?? "A friend");

  if (input.type === "social_ping") {
    const message = (input.message ?? "").trim();
    if (!message) return { ok: false, error: "Write a message." };
    const content: Record<string, string> = { senderName, message };
    if (input.link?.trim()) content.link = input.link.trim();

    const rows = recipientIds.map((rid) => ({
      user_id: rid,
      sender_id: actorId,
      type: "social_ping",
      title: null,
      content,
      status: "pending",
    }));
    const { error } = await admin.from("cards").insert(rows);
    if (error) return { ok: false, error: error.message };
  } else {
    const eventTitle = (input.eventTitle ?? "").trim();
    const eventTime = (input.eventTime ?? "").trim();
    if (!eventTitle) return { ok: false, error: "Give the event a title." };
    if (!eventTime) return { ok: false, error: "Add a date/time." };

    const { data: event, error: evErr } = await admin
      .from("events")
      .insert({
        creator_id: actorId,
        title: eventTitle,
        event_time: eventTime,
        location: input.location?.trim() || null,
        note: input.note?.trim() || null,
      })
      .select("id")
      .single();
    if (evErr || !event) return { ok: false, error: evErr?.message ?? "Couldn't create the event." };

    const content: Record<string, string> = { senderName, eventTime };
    if (input.startsAt) content.startsAt = input.startsAt;
    if (input.location?.trim()) content.location = input.location.trim();
    if (input.note?.trim()) content.note = input.note.trim();

    const rows = recipientIds.map((rid) => ({
      user_id: rid,
      sender_id: actorId,
      type: "social_invite",
      title: eventTitle,
      content,
      status: "pending",
      event_id: event.id,
    }));
    const { error } = await admin.from("cards").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  if (recipientIds.includes(actorId)) revalidatePath("/");
  return { ok: true, sent: recipientIds.length, notFound };
}

export interface CreatePostResult {
  ok: boolean;
  error?: string;
  sharedWith?: number;
}

/**
 * Publishes a post (one or more photos) to the author's profile. If linked to
 * an event the author created, it also drops a `social_post` recap card into
 * each attendee's deck. Images are uploaded client-side; this stores the paths
 * (both the legacy single `image_path` and the `image_paths[]` array) and fans
 * the recap out to co-attendees.
 */
export async function createPost(input: {
  caption?: string;
  imagePaths: string[];
  eventId?: string | null;
}): Promise<CreatePostResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const { actorId } = actor;

  const paths = (input.imagePaths ?? []).filter(Boolean);
  if (paths.length === 0) return { ok: false, error: "Missing image." };

  const admin = createAdminClient();
  const eventId = input.eventId || null;

  const { error: postErr } = await admin.from("posts").insert({
    author_id: actorId,
    image_path: paths[0],
    image_paths: paths,
    caption: input.caption?.trim() || null,
    event_id: eventId,
  });
  if (postErr) return { ok: false, error: postErr.message };

  let sharedWith = 0;
  if (eventId) {
    const { data: event } = await admin
      .from("events")
      .select("id, title, creator_id")
      .eq("id", eventId)
      .maybeSingle();

    if (event && event.creator_id === actorId) {
      const { data: inviteCards } = await admin
        .from("cards")
        .select("user_id")
        .eq("event_id", eventId)
        .eq("type", "social_invite");

      const attendeeIds = Array.from(
        new Set((inviteCards ?? []).map((c) => c.user_id as string)),
      ).filter((id) => id !== actorId);

      if (attendeeIds.length > 0) {
        const senderName =
          actor.activeProfile.displayName ||
          actor.activeProfile.username ||
          nameFromEmail(actor.userEmail ?? "A friend");
        const content: Record<string, unknown> = {
          senderName,
          imagePaths: paths,
          imagePath: paths[0],
          eventTitle: event.title,
        };
        if (input.caption?.trim()) content.caption = input.caption.trim();

        const rows = attendeeIds.map((rid) => ({
          user_id: rid,
          sender_id: actorId,
          type: "social_post",
          title: null,
          content,
          status: "pending",
          event_id: eventId,
        }));
        const { error } = await admin.from("cards").insert(rows);
        if (!error) sharedWith = attendeeIds.length;
      }
    }
  }

  revalidatePath("/profile");
  revalidatePath("/me");
  return { ok: true, sharedWith };
}
