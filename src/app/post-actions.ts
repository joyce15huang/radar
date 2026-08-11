"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Deletes one of the current user's posts (RLS enforces ownership too). */
export async function deletePost(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("posts").delete().eq("id", id).eq("author_id", user.id);
  revalidatePath("/me");
  revalidatePath("/profile");
}
