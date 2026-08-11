"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillUserDeck } from "@/lib/scout/persistDeck";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "You're not signed in." };

  const { data: prefs } = await supabase
    .from("preferences")
    .select("standing_prompt, locations")
    .eq("user_id", user.id)
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
    const r = await fillUserDeck(admin, user.id, {
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
