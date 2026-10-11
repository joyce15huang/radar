"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { updateCardStatus } from "@/app/feed-actions";
import { cancelEvent } from "@/app/event-actions";

/**
 * Quiet footer action on the plan page. Just you → takes it off your calendar.
 * Guests on it → cancels the plan for everyone (they get a note on Today).
 */
export function RemoveFromCalendar({ cardId, eventId, hasGuests = false }: { cardId: string; eventId?: string; hasGuests?: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const cancelAll = hasGuests && !!eventId;

  async function remove() {
    setBusy(true);
    setError(null);
    if (cancelAll) {
      const res = await cancelEvent(eventId as string);
      if (!res.ok) {
        setBusy(false);
        setError(res.error ?? "Couldn't cancel the plan.");
        return;
      }
    } else {
      await updateCardStatus(cardId, "dismissed");
    }
    router.push("/calendar");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-1.5 pt-2">
      {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}
      {confirming ? (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-neutral-600">{cancelAll ? "Cancel for everyone?" : "Remove from your calendar?"}</span>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-full bg-rose-600 px-3 py-1.5 font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? (cancelAll ? "Canceling…" : "Removing…") : cancelAll ? "Cancel plan" : "Remove"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-full px-3 py-1.5 font-semibold text-neutral-600 hover:bg-neutral-200/60"
          >
            Keep
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold text-neutral-500 transition hover:bg-neutral-200/60 hover:text-rose-600"
        >
          <Trash2 className="h-3.5 w-3.5" /> {cancelAll ? "Cancel plan" : "Remove from calendar"}
        </button>
      )}
    </div>
  );
}
