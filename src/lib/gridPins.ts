// Server-only: event photos a person pinned to their profile grid (0040).
import type { createAdminClient } from "@/lib/supabase/admin";
import { publicImageUrl } from "@/lib/storage";
import type { ProfilePost } from "@/components/ProfileWall";

type Admin = ReturnType<typeof createAdminClient>;

export async function pinnedGridItems(admin: Admin, userId: string): Promise<ProfilePost[]> {
  const { data: pins, error } = await admin
    .from("grid_pins")
    .select("id, post_id, image_index, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !pins?.length) return []; // table missing before 0040, or none yet

  const postIds = [...new Set(pins.map((p) => p.post_id as string))];
  const { data: posts } = await admin
    .from("posts")
    .select("id, author_id, image_path, image_paths, taken_on, created_at, event_id, events(title)")
    .in("id", postIds);
  const byId = new Map((posts ?? []).map((p) => [p.id as string, p]));
  const authorIds = [...new Set((posts ?? []).map((p) => p.author_id as string))].filter((a) => a !== userId);
  const { data: authors } = authorIds.length
    ? await admin.from("profiles").select("id, username, display_name").in("id", authorIds)
    : { data: [] };
  const nameOf = new Map((authors ?? []).map((a) => [a.id as string, (a.display_name as string) || (a.username as string) || "a friend"]));

  const out: ProfilePost[] = [];
  for (const pin of pins) {
    const post = byId.get(pin.post_id as string);
    if (!post) continue;
    const paths = (post.image_paths as string[] | null)?.length ? (post.image_paths as string[]) : post.image_path ? [post.image_path as string] : [];
    const url = publicImageUrl(paths[pin.image_index as number] ?? paths[0]);
    if (!url) continue;
    const ev = post.events as { title?: string } | { title?: string }[] | null;
    out.push({
      id: `pin:${pin.id}`,
      pinId: pin.id as string,
      postId: post.id as string,
      imageUrls: [url],
      caption: null,
      createdAt: pin.created_at as string,
      takenOn: (post.taken_on as string | null) ?? (post.created_at as string),
      eventTitle: Array.isArray(ev) ? ev[0]?.title ?? null : ev?.title ?? null,
      eventId: (post.event_id as string | null) ?? null,
      credit: post.author_id === userId ? undefined : nameOf.get(post.author_id as string),
    });
  }
  return out;
}

/** Own posts + pinned photos, newest first. */
export function mergeGrid(posts: ProfilePost[], pins: ProfilePost[]): ProfilePost[] {
  return [...posts, ...pins].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
