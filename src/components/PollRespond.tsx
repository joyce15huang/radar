"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Lock, CalendarClock } from "lucide-react";
import { submitResponses, type PollView } from "@/app/poll-actions";
import type { Avail } from "@/lib/schedule";

const CHOICES: { value: Avail; label: string; on: string }[] = [
  { value: 2, label: "Yes", on: "bg-emerald-500 text-white" },
  { value: 1, label: "If need be", on: "bg-amber-400 text-neutral-900" },
  { value: 0, label: "No", on: "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900" },
];

/** Respondent view: tap Yes / If-need-be / No on each proposed time. You only
 *  ever see your own answers. */
export function PollRespond({ poll }: { poll: PollView }) {
  const router = useRouter();
  const closed = poll.status !== "open";

  const initial = useMemo(() => {
    const m: Record<string, Avail> = {};
    for (const o of poll.options) if (o.myAvail !== null) m[o.id] = o.myAvail;
    return m;
  }, [poll.options]);

  const [answers, setAnswers] = useState<Record<string, Avail>>(initial);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(poll.options.some((o) => o.myAvail !== null));
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (sending) return;
    setSending(true);
    setError(null);
    const res = await submitResponses(poll.id, answers);
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't send that.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  if (closed) {
    return (
      <div className="rounded-2xl border border-neutral-200/70 bg-white p-5 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <Lock className="mx-auto mb-2 h-5 w-5 text-neutral-400" />
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{poll.hostName} has settled on a time.</p>
        {poll.eventId && (
          <Link
            href={`/event/${poll.eventId}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            <CalendarClock className="h-4 w-4" /> Open the event
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {poll.options.map((o) => {
          const cur = answers[o.id];
          return (
            <li className="rounded-2xl border border-neutral-200/70 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900" key={o.id}>
              <p className="mb-2 text-sm font-medium text-neutral-900 dark:text-neutral-50">{o.label}</p>
              <div className="inline-flex rounded-full border border-neutral-200 p-0.5 dark:border-neutral-700">
                {CHOICES.map((ch) => (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [o.id]: ch.value }))}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                      cur === ch.value
                        ? ch.on
                        : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
                    }`}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saved ? "Update my answer" : "Send to host"}
        </button>
        {saved && !sending && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved ✓</span>}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
        <Lock className="h-3 w-3" /> Only {poll.hostName} sees your availability.
      </p>
    </div>
  );
}
