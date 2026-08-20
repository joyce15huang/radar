"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/actor";

export interface SaveProfileResult {
  ok: boolean;
  error?: string;
}

function normUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Updates the signed-in user's profile identity (name, bio, links). */
export async function saveProfile(input: {
  displayName?: string;
  bio?: string;
  website?: string;
  instagram?: string;
  twitter?: string;
}): Promise<SaveProfileResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const { supabase, actorId } = actor;

  const links: Record<string, string> = {};
  if (input.website?.trim()) links.website = normUrl(input.website.trim());
  if (input.instagram?.trim()) links.instagram = input.instagram.trim().replace(/^@/, "");
  if (input.twitter?.trim()) links.twitter = input.twitter.trim().replace(/^@/, "");

  const patch: Record<string, unknown> = {
    id: actorId,
    display_name: input.displayName?.trim() || null,
    bio: input.bio?.trim() || null,
    links,
  };

  const { error } = await supabase.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/me");
  revalidatePath("/profile");
  return { ok: true };
}
