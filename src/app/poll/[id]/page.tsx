import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Crown } from "lucide-react";
import { getActor } from "@/lib/actor";
import { getPoll, getResults } from "@/app/poll-actions";
import { PollRespond } from "@/components/PollRespond";
import { PollResults } from "@/components/PollResults";

/**
 * One "find a time" poll. The host sees the private results matrix + can lock a
 * time into a real event; a recipient sees only their own availability form.
 */
export default async function PollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");

  const poll = await getPoll(id);
  if (!poll) notFound();

  const results = poll.isHost ? await getResults(id) : null;

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <Link
          href="/calendar"
          className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="h-4 w-4" /> Calendar
        </Link>

        <header className="mb-5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
            Find a time
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {poll.title}
          </h1>
          <div className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
            {poll.location && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-neutral-400" />
                {poll.location}
              </p>
            )}
            <p className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
              <Crown className="h-4 w-4 text-fuchsia-400" />
              {poll.isHost ? "You're hosting" : `Hosted by ${poll.hostName}`}
            </p>
            {poll.feeCents ? (
              <p className="text-neutral-600 dark:text-neutral-300">
                Cost:{" "}
                <span className="font-medium text-neutral-800 dark:text-neutral-100">
                  ${(poll.feeCents / 100) % 1 === 0 ? poll.feeCents / 100 : (poll.feeCents / 100).toFixed(2)}
                </span>
              </p>
            ) : null}
          </div>
          {poll.note && (
            <p className="mt-3 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-neutral-600 dark:text-neutral-300">
              {poll.note}
            </p>
          )}
        </header>

        {poll.isHost && results ? (
          <PollResults pollId={id} initial={results} />
        ) : (
          <PollRespond poll={poll} />
        )}
      </div>
    </main>
  );
}
