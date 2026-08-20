"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateUsername } from "@/lib/username";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/actor";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export interface PersonaSummary {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarPath: string | null;
  isActive: boolean;
  isPrimary: boolean;
}

async function currentUserId(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}

/** Every persona this login owns, with the active one flagged. */
export async function listMyProfiles(): Promise<PersonaSummary[]> {
  const user = await currentUserId();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, username, display_name, avatar_path, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;
  const activeId = rows.find((r) => r.id === requested)?.id ?? user.id;

  return rows.map((r) => ({
    id: r.id as string,
    username: (r.username as string | null) ?? null,
    displayName: (r.display_name as string | null) ?? null,
    avatarPath: (r.avatar_path as string | null) ?? null,
    isActive: r.id === activeId,
    isPrimary: r.id === user.id,
  }));
}

export interface CreatePersonaResult {
  ok: boolean;
  error?: string;
  taken?: boolean;
  id?: string;
}

/** Create a new persona under this login and switch to it immediately. */
export async function createPersona(input: {
  username: string;
  displayName?: string;
}): Promise<CreatePersonaResult> {
  const parsed = validateUsername(input.username);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const user = await currentUserId();
  if (!user) return { ok: false, error: "You're not signed in." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .insert({
      owner_id: user.id,
      username: parsed.value,
      display_name: input.displayName?.trim() || null,
      email: user.email,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = the case-insensitive username unique index (handle taken).
    if (error.code === "23505") {
      return { ok: false, error: `@${parsed.value} is already taken.`, taken: true };
    }
    return { ok: false, error: error.message };
  }

  // Seed an empty preferences row so the new persona's deck logic has somewhere
  // to read/write its cities.
  await admin.from("preferences").insert({ user_id: data.id, standing_prompt: "" });

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PROFILE_COOKIE, data.id as string, COOKIE_OPTS);
  revalidatePath("/", "layout");
  return { ok: true, id: data.id as string };
}

/** Set the active persona (must be one this login owns). */
export async function switchPersona(
  profileId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await currentUserId();
  if (!user) return { ok: false, error: "You're not signed in." };

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!data) return { ok: false, error: "That profile isn't yours." };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PROFILE_COOKIE, profileId, COOKIE_OPTS);
  revalidatePath("/", "layout");
  return { ok: true };
}
