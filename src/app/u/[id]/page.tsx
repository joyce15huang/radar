import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { AccountBar } from "@/components/AccountBar";
import { TabNav } from "@/components/TabNav";
import { ProfileHeader, type ProfileHeaderData } from "@/components/ProfileHeader";
import { type HostedEventItem } from "@/components/ProfileEvents";
import { ProfilePanels } from "@/components/ProfilePanels";
import { getFriendState, mutualFriends } from "@/app/friends-actions";
import { listTeamsOf } from "@/app/team-actions";
import { publicImageUrl } from "@/lib/storage";

interface EventRow {
  id: string;
  title: string | null;
  event_time: string | null;
  starts_at: string | null;
  location: string | null;
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
  const [teams, { data: eventRows }, friendState, mutuals] = await Promise.all([
    listTeamsOf(id),
    admin
      .from("events")
      .select("id, title, event_time, starts_at, location")
      .eq("creator_id", id),
    getFriendState(id),
    mutualFriends(id),
  ]);

  const hosted: HostedEventItem[] = ((eventRows ?? []) as EventRow[]).map((e) => ({
    id: e.id,
    title: e.title ?? "Event",
    when: e.event_time ?? "",
    startsAt: e.starts_at ?? null,
    location: e.location ?? null,
  }));

  const links = (profile.links ?? {}) as ProfileHeaderData["links"];
  const header: ProfileHeaderData = {
    name: profile.display_name || profile.email?.split("@")[0] || "Someone",
    verified: profile.verified ?? false,
    bio: profile.bio ?? null,
    avatarUrl: publicImageUrl(profile.avatar_path),
    links,
  };

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <AccountBar email={actor.userEmail ?? undefined} link={{ href: "/profile", label: "Settings" }} />
        <TabNav />
        <ProfileHeader data={header} targetId={id} friendState={friendState} mutuals={mutuals} />
        <ProfilePanels teams={teams} events={hosted} isOwner={false} />
      </div>
    </main>
  );
}
