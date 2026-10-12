import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getActor } from "@/lib/actor";
import { listMyTeams } from "@/app/team-actions";
import { shortBy } from "@/lib/teams";
import { CreateTeamForm } from "@/components/team/CreateTeamForm";

export default async function TeamsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const teams = await listMyTeams();

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
        <div className="mb-2 flex h-12 items-center">
          <Link
            href="/calendar"
            aria-label="Back to Calendar"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-200/60"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </Link>
        </div>
        <header className="mb-5">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900">Teams</h1>
          <p className="mt-1 text-[15px] text-neutral-600">Your roster, the season, and who&rsquo;s in for each game.</p>
        </header>

        {teams.length > 0 && (
          <ul className="mb-8 space-y-3">
            {teams.map((t) => {
              const short = t.next ? shortBy(t.next.headcount) : 0;
              return (
                <li key={t.id}>
                  <Link
                    href={`/team/${t.id}`}
                    className="flex items-center gap-3.5 rounded-[18px] bg-white p-4 shadow-[0_8px_24px_rgba(80,50,35,0.07)] transition hover:bg-neutral-50"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-neutral-900 text-[15px] font-bold text-white">
                      {monogram(t.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-bold text-neutral-900">{t.name}</span>
                      <span className="block truncate text-[13px] text-neutral-500">
                        {t.next
                          ? `Next: ${t.next.title} · ${t.next.when}`
                          : `${t.memberCount} ${t.memberCount === 1 ? "member" : "members"} · nothing scheduled`}
                      </span>
                      {t.next && short > 0 && (
                        <span className="mt-1 inline-block text-[12px] font-bold text-fuchsia-800">{short} short</span>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <CreateTeamForm firstTeam={teams.length === 0} />
      </div>
    </main>
  );
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}
