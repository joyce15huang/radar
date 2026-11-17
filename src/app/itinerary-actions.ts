"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { createDirectEvent } from "@/app/poll-actions";
import { isoFromLocal } from "@/lib/localDateTime";
import { addDays, cleanItinerary, isYmd, MAX_DAYS, tripLabel, type ItinDay } from "@/lib/itinerary";

export interface ItinResult {
  ok: boolean;
  error?: string;
  eventId?: string;
}

const NEEDS_0047 = "Itineraries need database migration 0047 — run it in Supabase, then try again.";

function safeTz(tz: unknown): string {
  try {
    if (typeof tz === "string" && tz) {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    }
  } catch {}
  return "America/Los_Angeles";
}

function span(start: string, days: number, tz: string) {
  return {
    eventTime: tripLabel(start, days),
    startsAt: isoFromLocal(start, null, tz),
    endsAt: isoFromLocal(addDays(start, days - 1), "23:59", tz),
  };
}

/** A new itinerary plan: just you for now; invite from its page. */
export async function createItinerary(input: {
  title: string;
  startDate: string;
  tz: string;
  days: ItinDay[];
}): Promise<ItinResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const title = String(input.title ?? "").trim().slice(0, 120);
  if (!title) return { ok: false, error: "Give the trip a name." };
  if (!isYmd(input.startDate)) return { ok: false, error: "Pick a start date." };
  const days = cleanItinerary(input.days);
  if (days.length === 0) return { ok: false, error: "Add at least one day." };
  const tz = safeTz(input.tz);

  const admin = createAdminClient();
  // Check the column exists before creating anything, so a missing migration
  // doesn't leave a half-made plan behind.
  const probe = await admin.from("events").select("itinerary").limit(1);
  if (probe.error) return { ok: false, error: NEEDS_0047 };

  const { eventTime, startsAt, endsAt } = span(input.startDate, days.length, tz);
  const res = await createDirectEvent({
    title,
    eventTime,
    startsAt,
    hasTime: false,
    endsAt,
    recipientIds: [],
    allowSolo: true,
  });
  if (!res.ok || !res.eventId) return { ok: false, error: res.error ?? "Couldn't create the trip." };

  const { error } = await admin.from("events").update({ itinerary: days }).eq("id", res.eventId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, eventId: res.eventId };
}

/** Host only: replace the days. Adding or removing days moves the plan's end on every copy. */
export async function updateItinerary(input: {
  eventId: string;
  tz: string;
  days: ItinDay[];
}): Promise<ItinResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: ev, error: readErr } = await admin
    .from("events")
    .select("creator_id, starts_at, itinerary")
    .eq("id", input.eventId)
    .maybeSingle();
  if (readErr) return { ok: false, error: NEEDS_0047 };
  if (!ev || ev.creator_id !== actor.actorId) return { ok: false, error: "Only the host can edit the days." };

  const days = cleanItinerary(input.days).slice(0, MAX_DAYS);
  if (days.length === 0) return { ok: false, error: "Keep at least one day." };
  const tz = safeTz(input.tz);
  const start = ev.starts_at
    ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
        new Date(ev.starts_at as string),
      )
    : null;
  if (!start || !isYmd(start)) return { ok: false, error: "This plan has no start date." };

  const prevCount = Array.isArray(ev.itinerary) ? (ev.itinerary as unknown[]).length : 0;
  const { error } = await admin.from("events").update({ itinerary: days }).eq("id", input.eventId);
  if (error) return { ok: false, error: error.message };

  if (prevCount !== days.length) {
    const { eventTime, endsAt } = span(start, days.length, tz);
    await admin.from("events").update({ event_time: eventTime }).eq("id", input.eventId);
    const { data: cards } = await admin
      .from("cards")
      .select("id, content")
      .eq("event_id", input.eventId)
      .eq("type", "social_invite");
    for (const c of cards ?? []) {
      const content = { ...((c.content ?? {}) as Record<string, string>), eventTime, ...(endsAt ? { endsAt } : {}) };
      await admin.from("cards").update({ content }).eq("id", c.id);
    }
  }
  revalidatePath(`/event/${input.eventId}`);
  revalidatePath("/calendar");
  return { ok: true, eventId: input.eventId };
}
