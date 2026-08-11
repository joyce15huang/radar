"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface SaveProfileResult {
  ok: boolean;
  error?: string;
}

function normUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Updates the signed-in user's profile identity (name, kind, bio, links). */
export async function saveProfile(input: {
  displayName?: string;
  kind?: "person" | "org" | "group";
  bio?: string;
  website?: string;
  instagram?: string;
  twitter?: string;
}): Promise<SaveProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const links: Record<string, string> = {};
  if (input.website?.trim()) links.website = normUrl(input.website.trim());
  if (input.instagram?.trim()) links.instagram = input.instagram.trim().replace(/^@/, "");
  if (input.twitter?.trim()) links.twitter = input.twitter.trim().replace(/^@/, "");

  const patch: Record<string, unknown> = {
    id: user.id,
    display_name: input.displayName?.trim() || null,
    kind: input.kind ?? "person",
    bio: input.bio?.trim() || null,
    links,
  };

  const { error } = await supabase.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/me");
  revalidatePath("/profile");
  return { ok: true };
}

/** Persists just the account kind (used when toggling type; leaves other fields intact). */
export async function setAccountKind(kind: "person" | "org" | "group"): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").upsert({ id: user.id, kind }, { onConflict: "id" });
  revalidatePath("/me");
  revalidatePath("/profile");
}
