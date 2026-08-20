import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { AccountBar } from "@/components/AccountBar";
import { TabNav } from "@/components/TabNav";
import { ProfileWall, type ProfilePost } from "@/components/ProfileWall";
import { ProfileHeader, type ProfileHeaderData } from "@/components/ProfileHeader";
import { ProfileEvents, type HostedEventItem } from "@/components/ProfileEvents";
import { publicImageUrl } from "@/lib/storage";

interface EventRow {
  id: string;
  title: string | null;
  event_time: string | null;
  starts_at: string | null;
  location: string | null;
}

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

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { supabase, actorId } = actor;
  if (actorId === id) redirect("/me");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bio, links, avatar_path, verified, email")
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();

  const admin = createAdminClient();
  const [{ data: postRows }, { data: eventRows }] = await Promise.all([
    supabase
      .from("posts")
      .select("id, image_path, caption, created_at, events(title)")
      .eq("author_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("events")
      .select("id, title, event_time, starts_at, location")
      .eq("creator_id", id),
  ]);

  const hosted: HostedEventItem[] = ((eventRows ?? []) as EventRow[]).map((e) => ({
    id: e.id,
    title: e.title ?? "Event",
    when: e.event_time ?? "",
    startsAt: e.starts_at ?? null,
    location: e.location ?? null,
  }));

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

  const links = (profile.links ?? {}) as ProfileHeaderData["links"];
  const header: ProfileHeaderData = {
    name: profile.display_name || profile.email?.split("@")[0] || "Someone",
    verified: profile.verified ?? false,
    bio: profile.bio ?? null,
    avatarUrl: publicImageUrl(profile.avatar_path),
    links,
    hostedEvents: hosted.length,
    postCount: posts.length,
  };

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <AccountBar email={actor.userEmail ?? undefined} link={{ href: "/profile", label: "Settings" }} />
        <TabNav />
        <ProfileHeader data={header} />
        <ProfileEvents events={hosted} />
        <ProfileWall posts={posts} isOwner={false} />
      </div>
    </main>
  );
}
