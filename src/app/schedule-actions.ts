"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serverTimeZone } from "@/lib/tz";
import { parseEvents, nowContext, type ParsedEvent } from "@/lib/parse/schedule";
import { formatWhen } from "@/lib/localDateTime";
import { getActor } from "@/lib/actor";

export interface ParseScheduleResult {
  ok: boolean;
  events?: ParsedEvent[];
  error?: string;
}

/**
 * Parse free text into one or more events for the user to CONFIRM on a calendar.
 * Nothing is written yet. Each label is re-derived from its ISO so the weekday
 * always matches the date the picker will show.
 */
export async function parseSchedule(text: string): Promise<ParseScheduleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };
  if (!text.trim()) return { ok: false, error: "Type at least one event." };

  try {
    const tz = await serverTimeZone();
    const events = await parseEvents(text, { nowContext: nowContext(tz), multiple: true });
    const normalized: ParsedEvent[] = events.map((e) => ({
      ...e,
      when: e.startsAt ? formatWhen(e.startsAt, tz, e.hasTime) : e.when,
    }));
    if (normalized.length === 0) return { ok: false, error: "Couldn't read any events from that." };
    return { ok: true, events: normalized };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ConfirmScheduleItem {
  title: string;
  /** ISO chosen on the calendar (the source of truth). */
  startsAt: string;
  hasTime: boolean;
  location?: string;
  note?: string;
}

export interface ConfirmScheduleResult {
  ok: boolean;
  added?: number;
  error?: string;
}

/** Insert user-confirmed events (exact chosen dates) as accepted Calendar cards. */
export async function confirmSchedule(
  items: ConfirmScheduleItem[],
): Promise<ConfirmScheduleResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const { supabase, actorId } = actor;

  const clean = (items ?? []).filter((i) => i.title?.trim() && i.startsAt);
  if (clean.length === 0) return { ok: false, error: "Nothing to add." };

  const tz = await serverTimeZone();
  const rows = clean.map((it) => {
    const when = formatWhen(it.startsAt, tz, it.hasTime);
    const content: Record<string, string> = { time: when, startsAt: it.startsAt };
    if (it.location?.trim()) content.location = it.location.trim();
    if (it.note?.trim()) content.details = it.note.trim();
    return {
      user_id: actorId,
      sender_id: null,
      type: "calendar_radar",
      title: it.title.trim(),
      content,
      status: "accepted",
    };
  });

  const { error } = await supabase.from("cards").insert(rows);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/calendar");
  return { ok: true, added: rows.length };
}
