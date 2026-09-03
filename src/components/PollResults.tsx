"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Crown, CalendarClock } from "lucide-react";
import { finalizePoll, type PollResults } from "@/app/poll-actions";

/** HOST-only results: private per-option breakdown, weighted winner, and the
 *  Create-event action that locks a time and fires the official invites. */
export function PollResults({ pollId, initial }: { pollId: string; initial: PollResults }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closed = initial.status !== "open";

  // Options in ranked (best-first) order.
  const ordered = useMemo(() => {
    const idx = new Map(initial.ranked.map((id, i) => [id, i] as const));
    return [...initial.options].sort(
      (a, b) => (idx.get(a.id) ?? 99) - (idx.get(b.id) ?? 99),
    );
  }, [initial.options, initial.ranked]);

  const repliedCount = initial.people.filter((p) => p.responded).length;
  const waiting = initial.people.filter((p) => !p.responded);

  async function finalize(optionId: string) {
    if (busy) return;
    setBusy(optionId);
    setError(null);
    const res = await finalizePoll(pollId, optionId);
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? "Couldn't create the event.");
      return;
    }
    if (res.eventId) router.push(`/event/${res.eventId}`);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-600 dark:text-neutral-300">
        <span className="font-medium text-neutral-800 dark:text-neutral-100">
          {repliedCount} of {initial.people.length} replied
        </span>
        {waiting.length > 0 && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            waiting on {waiting.map((p) => p.name).join(", ")}
          </span>
        )}
      </div>

      {closed && (
        <div className="flex items-center gap-2 rounded-2xl border border-neutral-200/70 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
          <span className="text-neutral-700 dark:text-neutral-200">A time was locked in.</span>
          {initial.eventId && (
            <Link href={`/event/${initial.eventId}`} className="ml-auto text-sm font-medium text-neutral-900 underline-offset-2 hover:underline dark:text-neutral-100">
              Open event
            </Link>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {ordered.map((o, i) => {
          const isWinner = !closed && i === 0 && o.tally.responseCount > 0;
          const t = o.tally;
          return (
            <li
              key={o.id}
              className={`rounded-2xl border bg-white p-4 dark:bg-neutral-900 ${
                isWinner
                  ? "border-emerald-300 ring-1 ring-emerald-200 dark:border-emerald-400/30 dark:ring-emerald-400/20"
                  : "border-neutral-200/70 dark:border-neutral-800"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                    {isWinner && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                        <Crown className="h-3 w-3" /> Best
                      </span>
                    )}
                    {o.label}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="text-emerald-600 dark:text-emerald-400">{t.freeCount} free</span>
                    {t.maybeCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {t.maybeCount} maybe</span>}
                    {t.noCount > 0 && <span> · {t.noCount} no</span>}
                  </p>
                  {t.free.length > 0 && (
                    <p className="mt-0.5 truncate text-[0.7rem] text-neutral-400 dark:text-neutral-500">
                      Free: {t.free.join(", ")}
                    </p>
                  )}
                  {t.maybe.length > 0 && (
                    <p className="truncate text-[0.7rem] text-neutral-400 dark:text-neutral-500">
                      Maybe: {t.maybe.join(", ")}
                    </p>
                  )}
                </div>
                {!closed && (
                  <button
                    type="button"
                    onClick={() => finalize(o.id)}
                    disabled={!!busy}
                    className="shrink-0 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                  >
                    {busy === o.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Create event"
                    )}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {!closed && (
        <p className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
          <CalendarClock className="h-3 w-3" /> Create the event on a time to send everyone an official RSVP.
        </p>
      )}
    </div>
  );
}
