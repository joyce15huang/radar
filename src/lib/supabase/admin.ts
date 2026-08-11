import { createClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY admin client, authenticated with the Supabase SECRET key.
 * It BYPASSES Row Level Security, so it must never be imported into client code
 * or exposed to the browser. The nightly scout uses it to read every user's
 * preferences and insert cards on their behalf.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY environment variables.",
    );
  }

  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
