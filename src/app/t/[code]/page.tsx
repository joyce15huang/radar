import Link from "next/link";
import type { Metadata } from "next";
import { Users } from "lucide-react";
import { getActor } from "@/lib/actor";
import { previewTeam, joinTeam } from "@/app/team-actions";

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const team = await previewTeam(code);
  if (!team) return { title: "Join a team" };
  return { title: `Join ${team.name}`, description: `${team.captain} invited you to ${team.name}.` };
}

/** Public landing for a team link. Signed out: sign up, then come back here to join. */
export default async function TeamLinkPage({ params }: Params) {
  const { code } = await params;
  const [team, actor] = await Promise.all([previewTeam(code), getActor()]);

  if (!team) {
    return (
      <Shell>
        <h1 className="text-[24px] font-bold tracking-tight text-neutral-900">This team link doesn&rsquo;t work</h1>
        <p className="mt-2 text-[15px] text-neutral-600">Ask your captain for a fresh one.</p>
        <Link href="/calendar" className="mt-6 inline-flex h-12 items-center rounded-2xl bg-neutral-900 px-5 text-[15px] font-semibold text-white">
          Open the app
        </Link>
      </Shell>
    );
  }

  const asPlayer = joinTeam.bind(null, code, false);
  const asSub = joinTeam.bind(null, code, true);
  const next = `/t/${code}`;

  return (
    <Shell>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-fuchsia-800">
        <Users className="h-4 w-4" /> {team.captain} invited you
      </p>
      <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-tight text-neutral-900">{team.name}</h1>
      <p className="mt-1 text-[15px] text-neutral-600">
        {[team.blurb, `${team.players} ${team.players === 1 ? "player" : "players"}`].filter(Boolean).join(" · ")}
      </p>

      <ul className="mt-6 space-y-2 text-[14px] text-neutral-700">
        <li>Every game and practice lands on your calendar.</li>
        <li>Say in, maybe, or out in one tap — no group chat.</li>
      </ul>

      <div className="mt-8 space-y-3">
        {actor ? (
          <>
            <form action={asPlayer}>
              <button
                type="submit"
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-fuchsia-700 text-[16px] font-semibold text-white shadow-[0_10px_24px_rgba(181,82,74,0.25)] transition hover:bg-fuchsia-800"
              >
                Join the team
              </button>
            </form>
            <form action={asSub}>
              <button
                type="submit"
                className="flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-semibold text-neutral-700 transition hover:bg-neutral-100"
              >
                Join as a sub — only ask me when you&rsquo;re short
              </button>
            </form>
          </>
        ) : (
          <>
            <Link
              href={`/login?mode=signup&next=${encodeURIComponent(next)}`}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-fuchsia-700 text-[16px] font-semibold text-white shadow-[0_10px_24px_rgba(181,82,74,0.25)] transition hover:bg-fuchsia-800"
            >
              Sign up to join
            </Link>
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-semibold text-neutral-700 transition hover:bg-neutral-100"
            >
              I already have an account
            </Link>
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-linen px-5 pb-16 pt-16 sm:items-center sm:pt-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
