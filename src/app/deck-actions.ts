"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillUserDeck } from "@/lib/scout/persistDeck";
import { serverTimeZone } from "@/lib/tz";
import { formatWhen } from "@/lib/localDateTime";
import { getActor } from "@/lib/actor";

export interface GenState {
  status: "idle" | "done" | "error";
  generated?: number;
  message?: string;
}

/**
 * Fill the current user's deck on demand (same engine as the nightly scout).
 * With no `extra`, tops up to the daily cap; with `extra`, spawns that many more
 * beyond the cap. Runs Claude + Tavily live only if the shared pool can't cover
 * the gap (~15-25s in that case).
 */
async function runFill(extra?: number): Promise<GenState> {
  const actor = await getActor();
  if (!actor) return { status: "error", message: "You're not signed in." };
  const { supabase, actorId } = actor;

  const { data: prefs } = await supabase
    .from("preferences")
    .select("standing_prompt, locations")
    .eq("user_id", actorId)
    .maybeSingle();

  const locs = (((prefs?.locations as string[] | null) ?? []) as string[])
    .map((s) => s.trim())
    .filter(Boolean);
  const sp = (prefs?.standing_prompt as string | null)?.trim();
  const locations = locs.length ? locs : sp ? [sp] : [];

  if (locations.length === 0) {
    return {
      status: "error",
      message: "Set your location first — the scout needs somewhere to look.",
    };
  }

  try {
    const admin = createAdminClient();
    const r = await fillUserDeck(admin, actorId, {
      locations,
      todayISO: new Date().toISOString().slice(0, 10),
      ...(extra ? { extra } : {}),
    });
    revalidatePath("/");
    if (r.error) return { status: "error", message: r.error };
    return { status: "done", generated: r.filled };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Top up today's deck to the cap (empty-state button). */
export async function generateMyDeck(_prev: GenState, _fd: FormData): Promise<GenState> {
  return runFill();
}

/** Spawn more public cards beyond the daily cap ("find more" button). */
export async function generateMoreDeck(_prev: GenState, _fd: FormData): Promise<GenState> {
  return runFill(5);
}

export interface AddToCalResult {
  ok: boolean;
  error?: string;
  /** Human label of the scheduled time, after formatting. */
  when?: string;
}

/**
 * Add a discovered (scouted) card to the user's calendar as a PERSONAL event the
 * user owns and can edit. Converts the card in place into a `calendar_radar` row
 * (accepted), stamped with a concrete `startsAt`:
 *  - exact events pass their own source datetime (one-tap on the deck);
 *  - ongoing/undated ones pass a date the user picked.
 * The card keeps its `dedup_key`, so the scout won't re-surface it on Today. This
 * is distinct from promoting to a HOSTED event (event-actions.inviteToEvent):
 * this one is yours alone, edited via `updateEventCard`, no invite required.
 */
export async function addScoutedToCalendar(input: {
  id: string;
  startsAt: string;
  hasTime: boolean;
}): Promise<AddToCalResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const { supabase, actorId } = actor;
  if (!input.startsAt) return { ok: false, error: "Pick a date." };

  const { data: card, error: readErr } = await supabase
    .from("cards")
    .select("id, type, title, content")
    .eq("id", input.id)
    .eq("user_id", actorId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!card) return { ok: false, error: "Couldn't find that card." };
  if (card.type !== "news_scout" && card.type !== "time_window")
    return { ok: false, error: "Only discovered events can be added this way." };

  const tz = await serverTimeZone();
  const when = formatWhen(input.startsAt, tz, input.hasTime);
  const c = (card.content ?? {}) as Record<string, string | null>;

  const content: Record<string, string | null> = {
    time: when,
    startsAt: input.startsAt,
  };
  if (c.location) content.location = c.location;
  if (c.summary) content.details = c.summary;
  const src = c.actionUrl ?? c.sourceUrl ?? null;
  if (src) content.sourceUrl = src;

  const { error } = await supabase
    .from("cards")
    .update({
      type: "calendar_radar",
      status: "accepted",
      starts_at: input.startsAt,
      content,
    })
    .eq("id", input.id)
    .eq("user_id", actorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true, when };
}
