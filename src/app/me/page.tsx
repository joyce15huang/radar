import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { AccountBar } from "@/components/AccountBar";
import { TabNav } from "@/components/TabNav";
import { type ProfilePost } from "@/components/ProfileWall";
import { ProfileHeader, type ProfileHeaderData } from "@/components/ProfileHeader";
import { type HostedEventItem } from "@/components/ProfileEvents";
import { ProfilePanels } from "@/components/ProfilePanels";
import { CreateCardFab } from "@/components/CreateCardFab";
import { listFriends, listIncomingRequests } from "@/app/friends-actions";
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
  taken_on: string | null;
  events: { title: string } | { title: string }[] | null;
}

function eventTitleOf(e: PostRow["events"]): string | null {
  if (!e) return null;
  if (Array.isArray(e)) return e[0]?.title ?? null;
  return e.title ?? null;
}

export default async function MyProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { supabase, actorId } = actor;
  const wantsFriends = ["people", "friends"].includes((await searchParams).tab ?? "");

  const admin = createAdminClient();
  const [{ data: profile }, { data: postRows }, { data: eventRows }, friends, requests] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, bio, links, avatar_path, verified")
        .eq("id", actorId)
        .maybeSingle(),
      supabase
        .from("posts")
        .select("id, image_path, caption, created_at, taken_on, events(title)")
        .eq("author_id", actorId)
        .order("created_at", { ascending: false }),
      admin
        .from("events")
        .select("id, title, event_time, starts_at, location")
        .eq("creator_id", actorId),
      listFriends(),
      listIncomingRequests(),
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
      takenOn: row.taken_on,
      eventTitle: eventTitleOf(row.events),
    };
  });

  const links = (profile?.links ?? {}) as ProfileHeaderData["links"];
  const header: ProfileHeaderData = {
    name:
      profile?.display_name ||
      actor.activeProfile.username ||
      actor.userEmail?.split("@")[0] ||
      "You",
    verified: profile?.verified ?? false,
    bio: profile?.bio ?? null,
    avatarUrl: publicImageUrl(profile?.avatar_path),
    links,
  };

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <AccountBar email={actor.userEmail ?? undefined} link={{ href: "/profile", label: "Settings" }} />
        <TabNav />
        <ProfileHeader data={header} />
        <ProfilePanels
          posts={posts}
          events={hosted}
          isOwner
          friends={friends}
          requests={requests}
          initialTab={wantsFriends ? "friends" : "posts"}
        />
      </div>
      <CreateCardFab mode="post" />
    </main>
  );
}
