import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { AccountBar } from "@/components/AccountBar";
import { TabNav } from "@/components/TabNav";
import { ProfileHeader, type ProfileHeaderData } from "@/components/ProfileHeader";
import { type HostedEventItem } from "@/components/ProfileEvents";
import { ProfilePanels } from "@/components/ProfilePanels";
import { listFriends, listIncomingRequests } from "@/app/friends-actions";
import { listTeamsOf } from "@/app/team-actions";
import { publicImageUrl } from "@/lib/storage";

interface EventRow {
  id: string;
  title: string | null;
  event_time: string | null;
  starts_at: string | null;
  location: string | null;
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
  const [{ data: profile }, teams, { data: eventRows }, friends, requests] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, bio, links, avatar_path, verified")
        .eq("id", actorId)
        .maybeSingle(),
      listTeamsOf(actorId),
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
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-44 pt-8 sm:px-6 sm:pt-12">
        <AccountBar email={actor.userEmail ?? undefined} link={{ href: "/profile", label: "Settings" }} />
        <TabNav />
        <ProfileHeader data={header} />
        <ProfilePanels
          teams={teams}
          events={hosted}
          isOwner
          friends={friends}
          requests={requests}
          initialTab={wantsFriends ? "friends" : "teams"}
        />
      </div>
    </main>
  );
}
