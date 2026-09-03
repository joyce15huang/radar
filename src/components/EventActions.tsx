"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { updateCardStatus } from "@/app/feed-actions";

export interface EventActionData {
  /** The viewer's own invite card id; undefined if none (e.g. the host). */
  cardId?: string;
  isHost: boolean;
  /** The viewer's RSVP state. */
  status: "accepted" | "pending" | "none";
}

const pill =
  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60";
const neutralPill = `${pill} border border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800`;
const darkPill = `${pill} bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200`;

/** Guest RSVP (Going / Can't make it) for the event detail page. Host edit
 *  lives in the page header (EventHeader). */
export function EventActions({ data }: { data: EventActionData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function rsvp(next: "accepted" | "dismissed") {
    if (!data.cardId || busy) return;
    setBusy(true);
    await updateCardStatus(data.cardId, next);
    setBusy(false);
    router.refresh();
  }

  if (data.isHost) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {data.status === "pending" && (
        <>
          <button type="button" onClick={() => rsvp("accepted")} disabled={busy} className={darkPill}>
            <Check className="h-4 w-4" strokeWidth={2.25} /> Going
          </button>
          <button type="button" onClick={() => rsvp("dismissed")} disabled={busy} className={neutralPill}>
            <X className="h-4 w-4" strokeWidth={2.25} /> Can&rsquo;t make it
          </button>
        </>
      )}
      {data.status === "accepted" && (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
            <Check className="h-4 w-4" strokeWidth={2.5} /> You&rsquo;re going
          </span>
          <button type="button" onClick={() => rsvp("dismissed")} disabled={busy} className={neutralPill}>
            Can&rsquo;t make it
          </button>
        </>
      )}
    </div>
  );
}
