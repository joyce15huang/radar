"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverTimeZone } from "@/lib/tz";
import { parseEvents, nowContext } from "@/lib/parse/schedule";
import { normalizeUsername } from "@/lib/username";
import { formatWhen } from "@/lib/localDateTime";
import { getActor } from "@/lib/actor";

const EVENT_COLS =
  "id, creator_id, title, event_time, location, note, source_url, summary, category, starts_at, expires_at, opens_at, allow_reinvite";

interface EventRow {
  id: string;
  creator_id: string;
  title: string | null;
  event_time: string | null;
  location: string | null;
  note: string | null;
  source_url: string | null;
  summary: string | null;
  category: string | null;
  starts_at: string | null;
  expires_at: string | null;
  opens_at: string | null;
  allow_reinvite: boolean | null;
}

type Admin = ReturnType<typeof createAdminClient>;

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

/** Display handle for a user: "@username" when set, else a name from email. */
async function profileName(admin: Admin, userId: string): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("username, email")
    .eq("id", userId)
    .maybeSingle();
  if (data?.username) return `@${data.username}`;
  return nameFromEmail(data?.email ?? "A friend");
}

/** Resolve "@username" / email inputs to profile ids. */
async function resolveRecipients(
  admin: Admin,
  raws: string[],
): Promise<{ ids: string[]; notFound: string[] }> {
  const cleaned = Array.from(
    new Set(raws.map((r) => r.trim()).filter(Boolean)),
  );
  const emails: string[] = [];
  const usernames: string[] = [];
  const rawToKey = new Map<string, { kind: "email" | "username"; key: string }>();
  for (const raw of cleaned) {
    if (raw.includes("@") && raw.includes(".") && !raw.startsWith("@")) {
      const key = raw.toLowerCase();
      emails.push(key);
      rawToKey.set(raw, { kind: "email", key });
    } else {
      const key = normalizeUsername(raw);
      usernames.push(key);
      rawToKey.set(raw, { kind: "username", key });
    }
  }

  const byEmail = new Map<string, string>();
  const byUsername = new Map<string, string>();
  if (emails.length) {
    const { data } = await admin.from("profiles").select("id, email").in("email", emails);
    for (const p of data ?? []) byEmail.set(String(p.email).toLowerCase(), p.id as string);
  }
  if (usernames.length) {
    const { data } = await admin.from("profiles").select("id, username").in("username", usernames);
    for (const p of data ?? []) byUsername.set(String(p.username).toLowerCase(), p.id as string);
  }

  const ids = new Set<string>();
  const notFound: string[] = [];
  for (const raw of cleaned) {
    const m = rawToKey.get(raw)!;
    const id = m.kind === "email" ? byEmail.get(m.key) : byUsername.get(m.key);
    if (id) ids.add(id);
    else notFound.push(raw);
  }
  return { ids: Array.from(ids), notFound };
}

/** Denormalized invite content copied onto each attendee's card. */
function buildInviteContent(a: {
  event: EventRow;
  senderName: string;
  hostName: string;
}): Record<string, string> {
  const e = a.event;
  const c: Record<string, string> = {
    senderName: a.senderName,
    hostId: e.creator_id,
    hostName: a.hostName,
    eventTime: e.event_time ?? "",
    allowReinvite: e.allow_reinvite ? "true" : "false",
  };
  if (e.starts_at) c.startsAt = e.starts_at;
  if (e.location) c.location = e.location;
  if (e.note) c.note = e.note;
  if (e.source_url) c.sourceUrl = e.source_url;
  if (e.summary) c.summary = e.summary;
  if (e.category) c.category = e.category;
  if (e.expires_at) c.expiresAt = e.expires_at;
  if (e.opens_at) c.opensAt = e.opens_at;
  return c;
}

export interface InviteResult {
  ok: boolean;
  sent?: number;
  notFound?: string[];
  error?: string;
  eventId?: string;
}

/**
 * Invite friends to an event. Two modes:
 *  - `sourceCardId`: PROMOTE a discovered/personal card into a shared event you
 *    host (creates the `events` row from the card, preserving its source link +
 *    countdown, and converts the card into your editable host copy).
 *  - `eventId`: invite MORE people to an existing event (host always; a guest
 *    only when the host enabled `allow_reinvite`).
 * Fan-out uses the service role to write rows the recipients own.
 */
export async function inviteToEvent(input: {
  sourceCardId?: string;
  eventId?: string;
  recipients: string[];
  allowReinvite?: boolean;
  note?: string;
}): Promise<InviteResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const { actorId } = actor;

  const admin = createAdminClient();
  const { ids: recipientIds, notFound } = await resolveRecipients(admin, input.recipients);

  let event: EventRow | null = null;

  if (input.eventId) {
    const { data } = await admin.from("events").select(EVENT_COLS).eq("id", input.eventId).maybeSingle();
    event = (data as EventRow) ?? null;
    if (!event) return { ok: false, error: "That event no longer exists." };
    if (event.creator_id !== actorId) {
      if (!event.allow_reinvite)
        return { ok: false, error: "The host hasn't allowed guests to invite others." };
      const { data: mine } = await admin
        .from("cards")
        .select("id")
        .eq("event_id", event.id)
        .eq("user_id", actorId)
        .limit(1);
      if (!mine || mine.length === 0)
        return { ok: false, error: "Only people on the guest list can invite others." };
    }
  } else if (input.sourceCardId) {
    const { data: card } = await admin
      .from("cards")
      .select("id, type, title, content, event_id, user_id")
      .eq("id", input.sourceCardId)
      .maybeSingle();
    if (!card || card.user_id !== actorId)
      return { ok: false, error: "Couldn't find that item on your calendar." };

    if (card.event_id) {
      const { data } = await admin.from("events").select(EVENT_COLS).eq("id", card.event_id).maybeSingle();
      event = (data as EventRow) ?? null;
    }

    if (!event) {
      // Build the event from the source card, preserving its details + link.
      const c = (card.content ?? {}) as Record<string, string | null>;
      const title = card.title ?? c.eventTitle ?? "Event";
      const eventTime = c.eventTime ?? c.time ?? c.windowLabel ?? "";
      const { data: created, error: evErr } = await admin
        .from("events")
        .insert({
          creator_id: actorId,
          title,
          event_time: eventTime,
          location: c.location ?? null,
          note: c.note ?? c.details ?? null,
          source_url: c.actionUrl ?? c.sourceUrl ?? null,
          summary: c.summary ?? null,
          category: c.category ?? null,
          starts_at: c.startsAt ?? c.opensAt ?? null,
          expires_at: c.expiresAt ?? null,
          opens_at: c.opensAt ?? null,
          allow_reinvite: !!input.allowReinvite,
        })
        .select(EVENT_COLS)
        .single();
      if (evErr || !created) return { ok: false, error: evErr?.message ?? "Couldn't create the event." };
      event = created as EventRow;

      // Convert the source card into the host's (editable) event copy.
      const hostName = await profileName(admin, actorId);
      const hostContent = buildInviteContent({ event, senderName: hostName, hostName });
      await admin
        .from("cards")
        .update({ type: "social_invite", title, content: hostContent, status: "accepted", event_id: event.id })
        .eq("id", card.id);
    } else if (event.creator_id === actorId && typeof input.allowReinvite === "boolean") {
      await admin.from("events").update({ allow_reinvite: input.allowReinvite }).eq("id", event.id);
      event.allow_reinvite = input.allowReinvite;
    }
  } else {
    return { ok: false, error: "Nothing to invite to." };
  }

  if (recipientIds.length === 0) {
    return {
      ok: false,
      error: notFound.length ? `No one matched: ${notFound.join(", ")}` : "Add at least one person.",
      notFound,
      eventId: event.id,
    };
  }

  // Don't invite the host or anyone who already holds this event.
  const { data: existing } = await admin.from("cards").select("user_id").eq("event_id", event.id);
  const already = new Set((existing ?? []).map((r) => r.user_id as string));
  const targets = recipientIds.filter((id) => id !== event!.creator_id && !already.has(id));

  const inviterName = await profileName(admin, actorId);
  const hostName =
    event.creator_id === actorId ? inviterName : await profileName(admin, event.creator_id);
  const content = buildInviteContent({ event, senderName: inviterName, hostName });
  if (input.note?.trim()) content.note = input.note.trim();

  if (targets.length > 0) {
    const rows = targets.map((rid) => ({
      user_id: rid,
      sender_id: actorId,
      type: "social_invite",
      title: event!.title,
      content,
      status: "pending",
      event_id: event!.id,
    }));
    const { error } = await admin.from("cards").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true, sent: targets.length, notFound, eventId: event.id };
}

export interface UpdateHostResult {
  ok: boolean;
  error?: string;
  when?: string;
  startsAt?: string | null;
}

/**
 * Host-only edit of an event. Updates the `events` row, propagates the new
 * details onto every attendee's card copy IN PLACE (silent calendar sync), and
 * drops an `event_update` "details updated" card on top of each guest's Today.
 */
export async function updateHostEvent(input: {
  eventId: string;
  title: string;
  whenText: string;
  startsAt?: string;
  hasTime?: boolean;
  location?: string;
  note?: string;
}): Promise<UpdateHostResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const { actorId } = actor;

  const title = input.title.trim();
  const whenText = input.whenText.trim();
  if (!title) return { ok: false, error: "Give it a title." };
  if (!whenText && !input.startsAt) return { ok: false, error: "Add a date or time." };

  const admin = createAdminClient();
  const { data: eventData } = await admin.from("events").select(EVENT_COLS).eq("id", input.eventId).maybeSingle();
  const event = (eventData as EventRow) ?? null;
  if (!event) return { ok: false, error: "That event no longer exists." };
  if (event.creator_id !== actorId) return { ok: false, error: "Only the host can edit this event." };

  const tz = await serverTimeZone();
  let when = whenText;
  let startsAt: string | null = null;
  if (input.startsAt) {
    startsAt = input.startsAt;
    when = formatWhen(input.startsAt, tz, !!input.hasTime);
  } else {
    try {
      const parsed = await parseEvents(whenText, { nowContext: nowContext(tz), multiple: false });
      if (parsed[0]) {
        startsAt = parsed[0].startsAt ?? null;
        when = startsAt ? formatWhen(startsAt, tz, parsed[0].hasTime) : parsed[0].when || whenText;
      }
    } catch {
      // keep raw text
    }
  }

  const loc = input.location?.trim() || null;
  const note = input.note?.trim() || null;

  await admin
    .from("events")
    .update({ title, event_time: when, starts_at: startsAt, location: loc, note })
    .eq("id", input.eventId);

  const hostName = await profileName(admin, actorId);

  // Silent in-place sync of every attendee's card.
  const { data: cards } = await admin.from("cards").select("id, user_id, content").eq("event_id", input.eventId);
  for (const card of cards ?? []) {
    const prev = ((card.content ?? {}) as Record<string, string | null>) ?? {};
    const content: Record<string, string | null> = { ...prev, eventTime: when, hostName };
    if (startsAt) content.startsAt = startsAt;
    else delete content.startsAt;
    if (loc) content.location = loc;
    else delete content.location;
    if (note) content.note = note;
    else delete content.note;
    await admin.from("cards").update({ title, content }).eq("id", card.id as string);
  }

  // Re-surface on Today for guests (not the host). Clear stale updates first so
  // repeated edits don't stack.
  const guestIds = (cards ?? [])
    .map((c) => c.user_id as string)
    .filter((id) => id !== actorId);
  await admin
    .from("cards")
    .delete()
    .eq("event_id", input.eventId)
    .eq("type", "event_update")
    .eq("status", "pending");
  if (guestIds.length) {
    const updateRows = guestIds.map((rid) => {
      const content: Record<string, string> = {
        hostName,
        eventTitle: title,
        eventTime: when,
        changeSummary: "Details updated",
      };
      if (loc) content.location = loc;
      return {
        user_id: rid,
        sender_id: actorId,
        type: "event_update",
        title,
        content,
        status: "pending",
        event_id: input.eventId,
      };
    });
    await admin.from("cards").insert(updateRows);
  }

  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true, when, startsAt };
}

export interface ToggleReinviteResult {
  ok: boolean;
  error?: string;
  allow?: boolean;
}

/** Host-only: allow / disallow guests inviting others; propagate to cards. */
export async function toggleReinvite(input: {
  eventId: string;
  allow: boolean;
}): Promise<ToggleReinviteResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const { actorId } = actor;

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id, creator_id").eq("id", input.eventId).maybeSingle();
  if (!event) return { ok: false, error: "That event no longer exists." };
  if ((event.creator_id as string) !== actorId)
    return { ok: false, error: "Only the host can change this." };

  await admin.from("events").update({ allow_reinvite: input.allow }).eq("id", input.eventId);

  const { data: cards } = await admin.from("cards").select("id, content").eq("event_id", input.eventId);
  for (const card of cards ?? []) {
    const prev = ((card.content ?? {}) as Record<string, string | null>) ?? {};
    await admin
      .from("cards")
      .update({ content: { ...prev, allowReinvite: input.allow ? "true" : "false" } })
      .eq("id", card.id as string);
  }

  revalidatePath("/calendar");
  return { ok: true, allow: input.allow };
}
