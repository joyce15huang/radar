"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { updateCardStatus } from "@/app/feed-actions";

/** Quiet footer action on the event page: takes it off your calendar. */
export function RemoveFromCalendar({ cardId }: { cardId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    await updateCardStatus(cardId, "dismissed");
    router.push("/calendar");
    router.refresh();
  }

  return (
    <div className="flex justify-center pt-2">
      {confirming ? (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-neutral-600">Remove from your calendar?</span>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-full bg-rose-600 px-3 py-1.5 font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? "Removing…" : "Remove"}
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
          <Trash2 className="h-3.5 w-3.5" /> Remove from calendar
        </button>
      )}
    </div>
  );
}
