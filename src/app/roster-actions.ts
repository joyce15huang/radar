"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Attendee, EventRoster } from "@/lib/roster";

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

/**
 * The guest list for one shared event: who's going, who's still just invited.
 *
 * Cards are owner-only under RLS, so the roster is read with the service role —
 * but ONLY after confirming the caller is themselves on the event's guest list.
 * A user can therefore only ever see the roster of an event they belong to.
 * Declined (dismissed) guests are omitted. Returns null when the caller isn't an
 * attendee or nobody is on the list yet.
 */
export async function getEventRoster(eventId: string): Promise<EventRoster | null> {
  if (!eventId) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Authorize: the caller must hold a card for this event.
  const { data: mine } = await admin
    .from("cards")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .limit(1);
  if (!mine || mine.length === 0) return null;

  const { data: ev } = await admin
    .from("events")
    .select("creator_id")
    .eq("id", eventId)
    .maybeSingle();
  const hostId = (ev?.creator_id as string | undefined) ?? undefined;

  const { data: cardRows } = await admin
    .from("cards")
    .select("user_id, status")
    .eq("event_id", eventId)
    .eq("type", "social_invite");
  const rows = cardRows ?? [];

  const ids = Array.from(new Set(rows.map((r) => r.user_id as string)));
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, username, email")
      .in("id", ids);
    for (const p of profs ?? []) {
      const username = (p.username as string) || "";
      const email = (p.email as string) || "";
      nameById.set(p.id as string, username ? `@${username}` : nameFromEmail(email));
    }
  }

  const going: Attendee[] = [];
  const invited: Attendee[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const uid = r.user_id as string;
    if (seen.has(uid)) continue;
    seen.add(uid);
    const name = nameById.get(uid) ?? "Someone";
    const isHost = !!hostId && uid === hostId;
    if (r.status === "accepted") going.push({ id: uid, name, status: "going", isHost });
    else if (r.status === "pending") invited.push({ id: uid, name, status: "invited", isHost });
    // dismissed = declined → not shown
  }

  going.sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name));
  invited.sort((a, b) => a.name.localeCompare(b.name));

  if (going.length === 0 && invited.length === 0) return null;

  return { going, invited, goingCount: going.length, invitedCount: invited.length };
}
