import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getActor } from "@/lib/actor";
import { TabNav } from "@/components/TabNav";
import { ProfileHeader, type ProfileHeaderData } from "@/components/ProfileHeader";
import { ProfileTeams } from "@/components/ProfileTeams";
import { PastPlansGrid } from "@/components/PastPlansGrid";
import { getFriendState, mutualFriends } from "@/app/friends-actions";
import { listTeamsOf } from "@/app/team-actions";
import { listPastPlans } from "@/app/plan-photo-actions";
import { publicImageUrl } from "@/lib/storage";
import { serverTimeZone } from "@/lib/tz";

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

  const [teams, friendState, mutuals, plans, tz] = await Promise.all([
    listTeamsOf(id),
    getFriendState(id),
    mutualFriends(id),
    listPastPlans(id),
    serverTimeZone(),
  ]);

  const header: ProfileHeaderData = {
    name: profile.display_name || profile.email?.split("@")[0] || "Someone",
    verified: profile.verified ?? false,
    bio: profile.bio ?? null,
    avatarUrl: publicImageUrl(profile.avatar_path),
    links: (profile.links ?? {}) as ProfileHeaderData["links"],
  };

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-3 sm:px-6 sm:pt-8">
        <TabNav />
        <div className="mb-1 flex h-11 items-center">
          <Link
            href="/me"
            aria-label="Back"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-200/60"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </Link>
        </div>
        <ProfileHeader data={header} targetId={id} friendState={friendState} mutuals={mutuals} />
        {teams.length > 0 && (
          <section className="mb-6 space-y-2.5">
            <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">Teams</h2>
            <ProfileTeams teams={teams} isOwner={false} />
          </section>
        )}
        <PastPlansGrid plans={plans} isOwner={false} tz={tz} />
      </div>
    </main>
  );
}
