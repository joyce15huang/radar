// Server-only helpers for short invite links (/i/<code>).
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** Look up the event behind a short code (public preview; no auth needed). */
export async function eventForCode(admin: Admin, code: string) {
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) return null;
  const { data } = await admin
    .from("events")
    .select("id, creator_id, title, event_time, starts_at, location, note")
    .eq("invite_code", code)
    .maybeSingle();
  return data;
}

