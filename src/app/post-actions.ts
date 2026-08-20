"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/actor";

/** Deletes one of the active persona's posts (RLS enforces ownership too). */
export async function deletePost(id: string) {
  const actor = await getActor();
  if (!actor) return;

  await actor.supabase.from("posts").delete().eq("id", id).eq("author_id", actor.actorId);
  revalidatePath("/me");
  revalidatePath("/profile");
}
