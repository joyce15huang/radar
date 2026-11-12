import Link from "next/link";
import { redirect } from "next/navigation";
import { Menu } from "lucide-react";
import { getActor } from "@/lib/actor";
import { TabNav } from "@/components/TabNav";
import { ProfileHeader, type ProfileHeaderData } from "@/components/ProfileHeader";
import { ProfileStats } from "@/components/ProfileStats";
import { PastPlansGrid } from "@/components/PastPlansGrid";
import { listFriends, listIncomingRequests } from "@/app/friends-actions";
import { listTeamsOf } from "@/app/team-actions";
import { listPastPlans } from "@/app/plan-photo-actions";
import { publicImageUrl } from "@/lib/storage";
import { serverTimeZone } from "@/lib/tz";

export default async function MyProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { supabase, actorId } = actor;
  // Old links to the Friends subtab.
  if (["people", "friends"].includes((await searchParams).tab ?? "")) redirect("/friends");

  const [{ data: profile }, teams, friends, requests, plans, tz] = await Promise.all([
    supabase.from("profiles").select("display_name, bio, links, avatar_path, verified").eq("id", actorId).maybeSingle(),
    listTeamsOf(actorId),
    listFriends(),
    listIncomingRequests(),
    listPastPlans(actorId),
    serverTimeZone(),
  ]);

  const header: ProfileHeaderData = {
    name: profile?.display_name || actor.activeProfile.username || actor.userEmail?.split("@")[0] || "You",
    verified: profile?.verified ?? false,
    bio: profile?.bio ?? null,
    avatarUrl: publicImageUrl(profile?.avatar_path),
    links: (profile?.links ?? {}) as ProfileHeaderData["links"],
  };

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-3 sm:px-6 sm:pt-8">
        <TabNav />
        <div className="mb-1 flex justify-end">
          <Link
            href="/profile"
            aria-label="Settings"
            className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-200/60"
          >
            <Menu className="h-5 w-5" />
          </Link>
        </div>
        <ProfileHeader data={header} />
        <ProfileStats
          stats={[
            { value: plans.filter((p) => p.hosted).length, label: "plans hosted" },
            { value: friends.length, label: friends.length === 1 ? "friend" : "friends", href: "/friends", dot: requests.length > 0 },
            { value: teams.length, label: teams.length === 1 ? "team" : "teams", href: "/teams" },
          ]}
        />
        <PastPlansGrid plans={plans} isOwner tz={tz} />
      </div>
    </main>
  );
}
