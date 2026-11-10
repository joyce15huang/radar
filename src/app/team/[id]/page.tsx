import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getActor } from "@/lib/actor";
import { getTeam } from "@/app/team-actions";
import { threadSummaries } from "@/app/comment-actions";
import { TeamHome } from "@/components/team/TeamHome";
import { serverTimeZone } from "@/lib/tz";

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");
  const [team, tz] = await Promise.all([getTeam(id), serverTimeZone()]);
  if (!team) notFound();
  const threads = await threadSummaries([...team.upcoming.slice(0, 4), ...team.recent].map((e) => e.id));

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
        <div className="mb-2 flex h-12 items-center">
          <Link
            href="/teams"
            aria-label="Back to Teams"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-200/60"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </Link>
        </div>
        <TeamHome team={team} me={actor.actorId} tz={tz} threads={threads} />
      </div>
    </main>
  );
}
