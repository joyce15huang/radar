import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export const NEEDS_0041 = "Run migration 0041_event_capacity in Supabase to turn on guest limits.";

export interface WaitEntry {
  cardId: string;
  userId: string;
  at: string;
}

export interface CapInfo {
  /** null = no limit (or the 0041 columns aren't there yet). */
  capacity: number | null;
  waitlist: boolean;
  /** People holding a seat (said Going) — the host counts. */
  going: number;
  /** Oldest first. */
  waitlisted: WaitEntry[];
}

export type RsvpState = "going" | "waitlisted" | "full" | "declined";
export interface RsvpResult {
  state: RsvpState;
  /** 1-based place in line when waitlisted. */
  position?: number;
}

type Content = Record<string, string | null>;

/** Seats + waitlist for one plan. Safe before migration 0041 (reports no limit). */
export async function capInfo(admin: Admin, eventId: string): Promise<CapInfo> {
  let capacity: number | null = null;
  let waitlist = true;
  const { data: ev, error } = await admin.from("events").select("capacity, waitlist").eq("id", eventId).maybeSingle();
  if (!error && ev) {
    capacity = (ev.capacity as number | null) ?? null;
    waitlist = (ev.waitlist as boolean | null) ?? true;
  }
  const { data: cards } = await admin
    .from("cards")
    .select("id, user_id, status, content")
    .eq("event_id", eventId)
    .eq("type", "social_invite");
  let going = 0;
  const waitlisted: WaitEntry[] = [];
  const seen = new Set<string>();
  for (const c of cards ?? []) {
    const uid = c.user_id as string;
    if (seen.has(uid)) continue;
    seen.add(uid);
    const at = ((c.content ?? {}) as Content).waitlistedAt;
    if (c.status === "accepted") going += 1;
    else if (c.status === "pending" && at) waitlisted.push({ cardId: c.id as string, userId: uid, at });
  }
  waitlisted.sort((a, b) => a.at.localeCompare(b.at));
  return { capacity, waitlist, going, waitlisted };
}

const withoutWait = (c: Content): Content => {
  const next = { ...c };
  delete next.waitlistedAt;
  return next;
};

/**
 * Say Going / Can't go on a plan, honoring its guest limit:
 *  - Going with a free seat → accepted.
 *  - Going when full → waitlisted (if the host allows a waitlist) or "full".
 *  - Can't go from a seat → the first person on the waitlist moves in.
 * The caller must already have checked the card belongs to the actor.
 */
export async function applyRsvp(admin: Admin, cardId: string, going: boolean): Promise<RsvpResult> {
  const { data: card } = await admin
    .from("cards")
    .select("id, status, content, event_id")
    .eq("id", cardId)
    .maybeSingle();
  if (!card) return { state: "declined" };
  const eventId = card.event_id as string | null;
  const content = (card.content ?? {}) as Content;

  if (!going) {
    const hadSeat = card.status === "accepted";
    await admin.from("cards").update({ status: "dismissed", content: withoutWait(content) }).eq("id", cardId);
    if (hadSeat && eventId) await promoteFromWaitlist(admin, eventId);
    return { state: "declined" };
  }

  if (card.status === "accepted") return { state: "going" };
  if (!eventId) {
    await admin.from("cards").update({ status: "accepted" }).eq("id", cardId);
    return { state: "going" };
  }

  const info = await capInfo(admin, eventId);
  const full = info.capacity !== null && info.going >= info.capacity;
  if (!full) {
    await admin.from("cards").update({ status: "accepted", content: withoutWait(content) }).eq("id", cardId);
    return { state: "going" };
  }
  if (!info.waitlist) return { state: "full" };

  const at = content.waitlistedAt || new Date().toISOString();
  if (!content.waitlistedAt) {
    await admin
      .from("cards")
      .update({ status: "pending", content: { ...content, waitlistedAt: at } })
      .eq("id", cardId);
  }
  const ahead = info.waitlisted.filter((w) => w.cardId !== cardId && w.at < at).length;
  return { state: "waitlisted", position: ahead + 1 };
}

/** Move people off the waitlist (oldest first) while seats are free; tell each on Today. */
export async function promoteFromWaitlist(admin: Admin, eventId: string): Promise<number> {
  const info = await capInfo(admin, eventId);
  if (info.waitlisted.length === 0) return 0;
  const free = info.capacity === null ? info.waitlisted.length : Math.max(0, info.capacity - info.going);
  const moving = info.waitlisted.slice(0, free);
  if (moving.length === 0) return 0;

  const { data: ev } = await admin
    .from("events")
    .select("title, event_time, location, creator_id")
    .eq("id", eventId)
    .maybeSingle();
  let hostName = "The host";
  if (ev?.creator_id) {
    const { data: p } = await admin.from("profiles").select("username, email").eq("id", ev.creator_id).maybeSingle();
    hostName = p?.username ? `@${p.username}` : ((p?.email as string | null)?.split("@")[0] ?? hostName);
  }

  for (const w of moving) {
    const { data: c } = await admin.from("cards").select("content").eq("id", w.cardId).maybeSingle();
    await admin
      .from("cards")
      .update({ status: "accepted", content: withoutWait((c?.content ?? {}) as Content) })
      .eq("id", w.cardId);
    const note: Record<string, string> = {
      hostName,
      eventTitle: (ev?.title as string) ?? "Plan",
      eventTime: (ev?.event_time as string) ?? "",
      changeSummary: "You're in",
    };
    if (ev?.location) note.location = ev.location as string;
    await admin.from("cards").insert({
      user_id: w.userId,
      sender_id: ev?.creator_id ?? null,
      type: "event_update",
      title: (ev?.title as string) ?? "Plan",
      content: note,
      status: "pending",
      event_id: eventId,
    });
  }
  return moving.length;
}
