"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serverTimeZone } from "@/lib/tz";
import { parseEvents, nowContext } from "@/lib/parse/schedule";
import { formatWhen } from "@/lib/localDateTime";
import type { CardStatus } from "@/lib/types";

/**
 * Persists a card interaction from the feed. RLS already restricts writes to the
 * owner; the explicit user_id match is belt-and-suspenders.
 */
export async function updateCardStatus(id: string, status: CardStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("cards")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);
}

export interface UpdateEventResult {
  ok: boolean;
  error?: string;
  /** Normalized human-friendly time string after re-parsing. */
  when?: string;
  /** Refreshed ISO start, or null if none could be resolved. */
  startsAt?: string | null;
}

/**
 * Edits one of the user's own event cards (an accepted invite or a schedule
 * entry). Re-parses the free-text date/time through the schedule parser so
 * `startsAt` (which drives sorting + the date chip) and the display label stay
 * consistent with how events are created. Only the caller's own row is touched;
 * this does not edit the shared event or other attendees' copies.
 */
export async function updateEventCard(input: {
  id: string;
  type: "social_invite" | "calendar_radar";
  title: string;
  whenText: string;
  startsAt?: string;
  hasTime?: boolean;
  location?: string;
  note?: string;
}): Promise<UpdateEventResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const title = input.title.trim();
  const whenText = input.whenText.trim();
  if (!title) return { ok: false, error: "Give it a title." };
  if (!whenText && !input.startsAt) return { ok: false, error: "Add a date or time." };

  const { data: existing, error: readErr } = await supabase
    .from("cards")
    .select("content")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!existing) return { ok: false, error: "Couldn't find that event." };

  const tz = await serverTimeZone();
  let when = whenText;
  let startsAt: string | null = null;
  if (input.startsAt) {
    // Exact date chosen on the calendar — no parsing; label derived from the ISO.
    startsAt = input.startsAt;
    when = formatWhen(input.startsAt, tz, !!input.hasTime);
  } else {
    try {
      const events = await parseEvents(whenText, { nowContext: nowContext(tz), multiple: false });
      if (events[0]) {
        startsAt = events[0].startsAt ?? null;
        when = startsAt ? formatWhen(startsAt, tz, events[0].hasTime) : events[0].when || whenText;
      }
    } catch {
      // keep raw text, leave startsAt null
    }
  }

  const prev = (existing.content ?? {}) as Record<string, string | null>;
  const content: Record<string, string | null> = { ...prev };

  if (input.type === "social_invite") content.eventTime = when;
  else content.time = when;

  if (startsAt) content.startsAt = startsAt;
  else delete content.startsAt;

  const loc = input.location?.trim();
  if (loc) content.location = loc;
  else delete content.location;

  const note = input.note?.trim();
  if (input.type === "social_invite") {
    if (note) content.note = note;
    else delete content.note;
  } else {
    if (note) content.details = note;
    else delete content.details;
  }

  const { error } = await supabase
    .from("cards")
    .update({ title, content })
    .eq("id", input.id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/calendar");
  return { ok: true, when, startsAt };
}
