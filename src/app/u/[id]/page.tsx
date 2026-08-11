import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountBar } from "@/components/AccountBar";
import { TabNav } from "@/components/TabNav";
import { ProfileWall, type ProfilePost } from "@/components/ProfileWall";
import { FriendButton } from "@/components/FriendButton";
import { publicImageUrl } from "@/lib/storage";
import type { FriendshipState } from "@/lib/friends";

interface PostRow {
  id: string;
  image_path: string | null;
  image_paths: string[] | null;
  caption: string | null;
  created_at: string;
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (user.id === id) redirect("/me");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, email")
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();

  const [{ data: postRows }, { data: rel }] = await Promise.all([
    supabase
      .from("posts")
      .select("id, image_path, image_paths, caption, created_at")
      .eq("author_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user.id})`,
      )
      .maybeSingle(),
  ]);

  // Derive the viewer's relationship to this profile. A declined row reads as
  // "none" so the viewer can send a fresh request.
  let friendState: FriendshipState = { status: "none" };
  if (rel) {
    if (rel.status === "accepted") {
      friendState = { status: "friends", friendshipId: rel.id as string };
    } else if (rel.status === "pending") {
      friendState =
        rel.requester_id === user.id
          ? { status: "outgoing", friendshipId: rel.id as string }
          : { status: "incoming", friendshipId: rel.id as string };
    }
  }

  const posts: ProfilePost[] = (postRows ?? []).map((p: PostRow) => {
    const paths =
      Array.isArray(p.image_paths) && p.image_paths.length
        ? p.image_paths
        : p.image_path
          ? [p.image_path]
          : [];
    return {
      id: p.id,
      imageUrls: paths.map((x) => publicImageUrl(x)).filter((u): u is string => Boolean(u)),
      caption: p.caption,
      createdAt: p.created_at,
    };
  });

  const username = (profile.username as string | null) ?? null;
  const name = username ? `@${username}` : (profile.email?.split("@")[0] ?? "Someone");
  const targetHandle = username || ((profile.email as string) ?? "");

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <AccountBar email={user.email} link={{ href: "/profile", label: "Settings" }} />
        <TabNav />
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              {name}
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {posts.length} {posts.length === 1 ? "post" : "posts"}
            </p>
          </div>
          <FriendButton targetUsername={targetHandle} initial={friendState} />
        </header>
        <ProfileWall posts={posts} isOwner={false} />
      </div>
    </main>
  );
}
