"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCardStatus } from "@/app/feed-actions";

export interface EventActionData {
  /** The viewer's own invite card id; undefined if none (e.g. the host). */
  cardId?: string;
  isHost: boolean;
  /** The viewer's RSVP state. */
  status: "accepted" | "pending" | "none";
}

/** Guest RSVP as a segmented control: Going / Can't go. */
export function EventActions({ data }: { data: EventActionData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(data.status);

  async function rsvp(next: "accepted" | "dismissed") {
    if (!data.cardId || busy) return;
    setBusy(true);
    setStatus(next === "accepted" ? "accepted" : "none");
    await updateCardStatus(data.cardId, next);
    setBusy(false);
    router.refresh();
  }

  if (data.isHost) return null;

  const going = status === "accepted";
  const cant = status === "none";
  const seg = "min-h-[44px] rounded-xl text-[15px] font-semibold transition disabled:opacity-60";

  return (
    <section className="space-y-2.5">
      <h2 className="text-[13px] font-semibold text-neutral-600">Your RSVP</h2>
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-neutral-200/60 p-1">
        <button
          type="button"
          aria-pressed={going}
          onClick={() => rsvp("accepted")}
          disabled={busy}
          className={`${seg} ${going ? "bg-fuchsia-700 text-white shadow-sm" : "text-neutral-700 hover:bg-white/60"}`}
        >
          Going
        </button>
        <button
          type="button"
          aria-pressed={cant}
          onClick={() => rsvp("dismissed")}
          disabled={busy}
          className={`${seg} ${cant ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-700 hover:bg-white/60"}`}
        >
          Can&rsquo;t go
        </button>
      </div>
    </section>
  );
}
