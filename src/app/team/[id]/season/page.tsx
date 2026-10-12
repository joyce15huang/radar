import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getActor } from "@/lib/actor";
import { getTeam } from "@/app/team-actions";
import { canManage } from "@/lib/teams";
import { SeasonSetup } from "@/components/team/SeasonSetup";

export default async function SeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");
  const team = await getTeam(id);
  if (!team) notFound();
  if (!canManage(team.myRole)) redirect(`/team/${id}`);

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
        <div className="mb-2 flex h-12 items-center gap-1">
          <Link
            href={`/team/${id}`}
            aria-label={`Back to ${team.name}`}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-200/60"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </Link>
          <span className="text-[14px] font-semibold text-neutral-500">{team.name}</span>
        </div>
        <SeasonSetup teamId={id} teamName={team.name} hasEvents={team.upcoming.length > 0} />
      </div>
    </main>
  );
}
