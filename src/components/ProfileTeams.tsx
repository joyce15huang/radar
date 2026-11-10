import Link from "next/link";
import { ChevronRight, Plus, Users } from "lucide-react";
import type { ProfileTeam } from "@/app/team-actions";
import { EmptyState } from "./LibraryWall";

const ROLE: Record<ProfileTeam["role"], string | null> = {
  captain: "Captain",
  cocaptain: "Co-captain",
  player: null,
  sub: "Sub",
};

/** The Teams tab on a profile. Rows open the team page when the viewer is on it. */
export function ProfileTeams({ teams, isOwner }: { teams: ProfileTeam[]; isOwner: boolean }) {
  return (
    <div className="space-y-3">
      {teams.length === 0 ? (
        <EmptyState
          icon={<Users className="h-7 w-7" strokeWidth={2} />}
          title="No teams yet"
          body={isOwner ? "Start one for your league, or join from a captain's link." : "Not on any teams yet."}
        />
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-[18px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
          {teams.map((t) => {
            const body = (
              <>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-neutral-900 text-[14px] font-bold text-white">
                  {monogram(t.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-neutral-900">{t.name}</span>
                  <span className="block truncate text-[13px] text-neutral-500">
                    {[t.blurb, `${t.players} ${t.players === 1 ? "player" : "players"}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {ROLE[t.role] && (
                  <span className="shrink-0 rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">
                    {ROLE[t.role]}
                  </span>
                )}
                {t.viewerOn && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />}
              </>
            );
            return (
              <li key={t.id}>
                {t.viewerOn ? (
                  <Link href={`/team/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-neutral-50">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {isOwner && (
        <Link
          href="/teams"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-neutral-300 text-[15px] font-semibold text-neutral-900 transition hover:bg-white/60"
        >
          <Plus className="h-4 w-4" /> {teams.length ? "Start or manage teams" : "Start a team"}
        </Link>
      )}
    </div>
  );
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}
