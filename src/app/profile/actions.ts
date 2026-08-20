"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillUserDeck } from "@/lib/scout/persistDeck";
import { getActor } from "@/lib/actor";

export interface SaveState {
  status: "idle" | "saved" | "error";
  message?: string;
  /** How many cards the post-save fill produced (if any). */
  generated?: number;
}

/** Parse + clean the JSON locations list coming from the form. */
function parseLocations(raw: unknown): string[] {
  let arr: unknown = [];
  try {
    arr = JSON.parse(String(raw ?? "[]"));
  } catch {
    arr = [];
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const v = String(item).trim().replace(/\s+/g, " ");
    const k = v.toLowerCase();
    if (v && !seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

/** Compose the scout's standing prompt from the user's cities. */
function promptFromLocations(cities: string[]): string {
  if (cities.length === 0) return "";
  return `My locations: ${cities.join(", ")}. Give me a daily briefing of local happenings, hidden gems, and especially time-sensitive opportunities (astronomy/nature windows, permits & lotteries, pop-ups, seasonal events) near these places that I'd regret missing.`;
}

/**
 * Saves the user's cities, then tops up their deck so the change feels
 * immediately effective. Uses the gap-fill engine (not a wipe), so anything the
 * user has kept stays and dismissed items never return. The scout runs live only
 * if the shared pool can't cover the gap (~15-25s). Fill failures don't fail the
 * save.
 */
export async function savePreferences(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const cities = parseLocations(formData.get("locations"));
  if (cities.length === 0) {
    return { status: "error", message: "Add at least one city." };
  }
  const standing = promptFromLocations(cities);

  const actor = await getActor();
  if (!actor) return { status: "error", message: "You're not signed in." };
  const { supabase, actorId } = actor;

  const { error } = await supabase.from("preferences").upsert(
    { user_id: actorId, standing_prompt: standing, locations: cities },
    { onConflict: "user_id" },
  );
  if (error) return { status: "error", message: error.message };

  try {
    const admin = createAdminClient();
    const todayISO = new Date().toISOString().slice(0, 10);
    const result = await fillUserDeck(admin, actorId, { locations: cities, todayISO, refresh: true });

    revalidatePath("/");
    revalidatePath("/profile");

    if (result.error) {
      return {
        status: "saved",
        message: `Saved — but the deck refresh hit an error: ${result.error}`,
        generated: 0,
      };
    }
    return { status: "saved", generated: result.filled };
  } catch (e) {
    revalidatePath("/profile");
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: "saved",
      message: `Saved. Deck not refreshed yet (${msg}).`,
      generated: 0,
    };
  }
}
