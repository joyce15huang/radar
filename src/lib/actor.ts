// Resolve who a request is acting AS. One login (auth.users) can own several
// "personas" (profiles); the `active_profile` cookie names which one is active.
// Server-only: reads cookies + the session. Import from server components /
// server actions, never client code.
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_PROFILE_COOKIE = "active_profile";

export interface ActiveProfile {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarPath: string | null;
  email: string | null;
  /** True when this is the login's original profile (id == auth uid). */
  isPrimary: boolean;
}

export interface Actor {
  /** The auth login. */
  userId: string;
  userEmail: string | null;
  /** The profile the request is acting AS (the login's primary by default). */
  actorId: string;
  activeProfile: ActiveProfile;
  /** The request-scoped Supabase client (session-aware), reused by callers. */
  supabase: Awaited<ReturnType<typeof createClient>>;
}

interface OwnedRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_path: string | null;
  email: string | null;
}

/**
 * Returns the acting persona, or null when unauthenticated. Falls back to the
 * PRIMARY persona (profile whose id == the login's auth uid) whenever the cookie
 * is missing, malformed, or points at a profile this login doesn't own — so a
 * stale/forged cookie can never make you act as someone else's profile.
 *
 * Resilient to a not-yet-applied 0019 migration: if `owner_id` doesn't exist the
 * lookup fails softly and the caller simply acts as their primary id.
 */
export async function getActor(): Promise<Actor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;

  // Every persona this login owns (RLS: authenticated can read profiles).
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_path, email")
    .eq("owner_id", user.id);

  const rows = (data ?? []) as OwnedRow[];
  const primaryId = user.id;
  const active =
    rows.find((r) => r.id === requested) ??
    rows.find((r) => r.id === primaryId) ??
    rows[0];

  const actorId = active?.id ?? primaryId;

  return {
    userId: user.id,
    userEmail: user.email ?? null,
    actorId,
    activeProfile: {
      id: actorId,
      username: active?.username ?? null,
      displayName: active?.display_name ?? null,
      avatarPath: active?.avatar_path ?? null,
      email: active?.email ?? user.email ?? null,
      isPrimary: actorId === primaryId,
    },
    supabase,
  };
}
