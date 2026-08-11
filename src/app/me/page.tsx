import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountBar } from "@/components/AccountBar";
import { TabNav } from "@/components/TabNav";
import { ProfileWall, type ProfilePost } from "@/components/ProfileWall";
import { ProfileHeader, type ProfileHeaderData } from "@/components/ProfileHeader";
import { publicImageUrl } from "@/lib/storage";

interface PostRow {
  id: string;
  image_path: string | null;
  caption: string | null;
  created_at: string;
  events: { title: string } | { title: string }[] | null;
}

function eventTitleOf(e: PostRow["events"]): string | null {
  if (!e) return null;
  if (Array.isArray(e)) return e[0]?.title ?? null;
  return e.title ?? null;
}

export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const [{ data: profile }, { data: postRows }, { count: hostedEvents }] = await Promise.all([
    supabase
      .from("profiles")
      .select("kind, display_name, bio, links, avatar_path, verified")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("posts")
      .select("id, image_path, caption, created_at, events(title)")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false }),
    admin.from("events").select("id", { count: "exact", head: true }).eq("creator_id", user.id),
  ]);

  const posts: ProfilePost[] = (postRows ?? []).map((p) => {
    const row = p as unknown as PostRow;
    return {
      id: row.id,
      imageUrl: publicImageUrl(row.image_path),
      caption: row.caption,
      createdAt: row.created_at,
      eventTitle: eventTitleOf(row.events),
    };
  });

  const links = (profile?.links ?? {}) as ProfileHeaderData["links"];
  const header: ProfileHeaderData = {
    name: profile?.display_name || user.email?.split("@")[0] || "You",
    kind: (profile?.kind as ProfileHeaderData["kind"]) ?? "person",
    verified: profile?.verified ?? false,
    bio: profile?.bio ?? null,
    avatarUrl: publicImageUrl(profile?.avatar_path),
    links,
    hostedEvents: hostedEvents ?? 0,
    postCount: posts.length,
  };

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <AccountBar email={user.email} link={{ href: "/profile", label: "Settings" }} />
        <TabNav />
        <ProfileHeader data={header} />
        <ProfileWall posts={posts} isOwner />
      </div>
    </main>
  );
}
