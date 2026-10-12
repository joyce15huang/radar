"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2 } from "lucide-react";
import { updateCardStatus } from "@/app/feed-actions";

export interface EventActionData {
  /** The viewer's own invite card id; undefined if none (e.g. the host). */
  cardId?: string;
  isHost: boolean;
  /** The viewer's RSVP state. */
  status: "accepted" | "pending" | "waitlisted" | "none";
  /** Guest limit (null = none) and how it stands. */
  capacity?: number | null;
  going?: number;
  waitlistOn?: boolean;
  waitlistCount?: number;
  /** 1-based place in line when waitlisted. */
  myPosition?: number | null;
}

/**
 * Guest RSVP. Normally a Going / Can't go switch; on a full plan "Going"
 * becomes "Join the waitlist", and once you're in line it shows your place.
 */
export function EventActions({ data }: { data: EventActionData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(data.status);
  const [position, setPosition] = useState<number | null>(data.myPosition ?? null);
  const [note, setNote] = useState<string | null>(null);

  if (data.isHost) return null;

  const cap = data.capacity ?? null;
  const going = data.going ?? 0;
  const left = cap === null ? null : Math.max(0, cap - going);
  const full = left === 0 && status !== "accepted";

  async function rsvp(next: "accepted" | "dismissed") {
    if (!data.cardId || busy) return;
    setBusy(true);
    setNote(null);
    if (!full || next === "dismissed") setStatus(next === "accepted" ? "accepted" : "none");
    const res = await updateCardStatus(data.cardId, next);
    setBusy(false);
    if (res?.state === "waitlisted") {
      setStatus("waitlisted");
      setPosition(res.position ?? null);
    } else if (res?.state === "full") {
      setStatus(data.status === "accepted" ? "none" : data.status);
      setNote("This plan just filled up.");
    } else if (res?.state === "declined") {
      setPosition(null);
    }
    router.refresh();
  }

  const seg = "min-h-[44px] rounded-xl text-[15px] font-semibold transition disabled:opacity-60";
  const header = (
    <div className="flex items-center justify-between">
      <h2 className="text-[13px] font-semibold text-neutral-600">Your RSVP</h2>
      {left !== null && left > 0 && status !== "waitlisted" && (
        <span className="inline-flex h-[26px] items-center rounded-lg bg-amber-100 px-2.5 text-[12px] font-bold text-amber-800">
          {left} {left === 1 ? "spot" : "spots"} left
        </span>
      )}
    </div>
  );

  // In line for a spot.
  if (status === "waitlisted") {
    return (
      <section className="flex items-center gap-3 rounded-[18px] bg-violet-100 px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[15px] font-bold text-violet-700">
          {position ? `#${position}` : <Clock className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-violet-900">You&rsquo;re on the waitlist</p>
          <p className="text-[13px] text-violet-700">We&rsquo;ll move you in and tell you on Today if a spot opens.</p>
        </div>
        <button
          type="button"
          onClick={() => rsvp("dismissed")}
          disabled={busy}
          className="shrink-0 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-violet-700 transition hover:bg-white/60 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Leave"}
        </button>
      </section>
    );
  }

  // Full: join the line (or it's simply full).
  if (full) {
    const ahead = data.waitlistCount ?? 0;
    return (
      <section className="space-y-2.5">
        {header}
        {data.waitlistOn ? (
          <>
            <button
              type="button"
              onClick={() => rsvp("accepted")}
              disabled={busy}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-[15px] font-bold text-white transition hover:bg-neutral-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              Join the waitlist
            </button>
            <p className="text-center text-[13px] text-neutral-500">
              {ahead === 0 ? "You'd be first in line" : `${ahead} ${ahead === 1 ? "person" : "people"} ahead of you`}
            </p>
          </>
        ) : (
          <p className="rounded-2xl bg-neutral-100 px-4 py-3.5 text-center text-[14px] font-medium text-neutral-600">
            This plan is full.
          </p>
        )}
        {status === "pending" && (
          <button
            type="button"
            onClick={() => rsvp("dismissed")}
            disabled={busy}
            className="mx-auto block text-[13px] font-semibold text-neutral-500 hover:text-neutral-800"
          >
            Can&rsquo;t go
          </button>
        )}
      </section>
    );
  }

  const isGoing = status === "accepted";
  const cant = status === "none";
  return (
    <section className="space-y-2.5">
      {header}
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-neutral-200/60 p-1">
        <button
          type="button"
          aria-pressed={isGoing}
          onClick={() => rsvp("accepted")}
          disabled={busy}
          className={`${seg} ${isGoing ? "bg-fuchsia-700 text-white shadow-sm" : "text-neutral-700 hover:bg-white/60"}`}
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
      {note && <p className="text-center text-[13px] font-medium text-neutral-600">{note}</p>}
    </section>
  );
}
