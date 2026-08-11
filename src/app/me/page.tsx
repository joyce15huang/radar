import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountBar } from "@/components/AccountBar";
import { TabNav } from "@/components/TabNav";
import { ProfileTabs } from "@/components/ProfileTabs";
import { ProfileWall, type ProfilePost } from "@/components/ProfileWall";
import { CreateCardFab } from "@/components/CreateCardFab";
import { publicImageUrl } from "@/lib/storage";

interface PostRow {
  id: string;
  image_path: string | null;
  image_paths: string[] | null;
  caption: string | null;
  created_at: string;
}

export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: postRows }, { data: myEvents }] = await Promise.all([
    supabase
      .from("posts")
      .select("id, image_path, image_paths, caption, created_at")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("events")
      .select("id, title")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

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

  const name = user.email?.split("@")[0] ?? "You";

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <AccountBar email={user.email} link={{ href: "/profile", label: "Settings" }} />
        <TabNav />
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Your profile — {posts.length} {posts.length === 1 ? "post" : "posts"}.
          </p>
        </header>
        <ProfileTabs />
        <ProfileWall posts={posts} isOwner />
      </div>
      <CreateCardFab mode="post" events={myEvents ?? []} />
    </main>
  );
}
