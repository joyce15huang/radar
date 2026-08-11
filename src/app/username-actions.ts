"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateUsername } from "@/lib/username";
import type { UsernameResult } from "@/lib/username";

/**
 * Claim or change the signed-in user's username.
 *
 * Writes via the service-role client and UPSERTs on the primary key so it works
 * even when the caller has no `profiles` row yet — e.g. accounts created before
 * the `handle_new_user` trigger existed, or a signup where the trigger didn't
 * fire. (A plain owner-RLS UPDATE would match zero rows and fail silently there,
 * and `profiles` has no INSERT policy for the normal client to fall back on.)
 *
 * Uniqueness is enforced by the case-insensitive index in migration 0011 — we
 * catch the 23505 violation and report it as "taken" rather than pre-checking
 * (avoids a check-then-write race).
 */
export async function setUsername(raw: string): Promise<UsernameResult> {
  const parsed = validateUsername(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  // id + username are always written; email only when present so we never null
  // out an existing email on update.
  const row: { id: string; username: string; email?: string } = {
    id: user.id,
    username: parsed.value,
  };
  if (user.email) row.email = user.email;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .upsert(row, { onConflict: "id" })
    .select("username")
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation on the lower(username) index (handle taken).
    if (error.code === "23505") {
      return { ok: false, error: `@${parsed.value} is already taken.`, taken: true };
    }
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Couldn't save your username — try again." };
  }

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/onboarding");
  return { ok: true, username: parsed.value };
}
