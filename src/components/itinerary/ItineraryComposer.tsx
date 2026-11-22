"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { clientTimeZone, localFromIso } from "@/lib/localDateTime";
import { tripLabel } from "@/lib/itinerary";
import { createItinerary } from "@/app/itinerary-actions";
import { ItineraryDays, DaysStepper, blankDay, fromDraft, type DraftDay } from "./ItineraryDays";

/** The Itinerary side of New plan: a name, a start date, then Day 1, Day 2 … typed by hand. */
export function ItineraryComposer() {
  const router = useRouter();
  const tz = clientTimeZone();
  const today = useMemo(() => localFromIso(new Date().toISOString(), tz)?.date ?? new Date().toISOString().slice(0, 10), [tz]);

  const [title, setTitle] = useState("");
  const [start, setStart] = useState(today);
  const [days, setDays] = useState<DraftDay[]>(() => [blankDay(), blankDay()]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (sending) return;
    if (!title.trim()) return setError("Give the trip a name.");
    if (!start) return setError("Pick a start date.");
    setError(null);
    setSending(true);
    const res = await createItinerary({ title: title.trim(), startDate: start, tz, days: fromDraft(days) });
    setSending(false);
    if (!res.ok || !res.eventId) return setError(res.error ?? "Couldn't create the trip.");
    router.push(`/event/${res.eventId}`);
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 pb-44 pt-1.5">
        <label className="block">
          <span className="text-[13px] font-medium text-neutral-500">Name the trip</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tahoe weekend"
            maxLength={120}
            autoFocus
            className="mt-1 w-full bg-transparent text-[30px] font-bold leading-tight tracking-tight text-neutral-900 outline-none placeholder:text-neutral-300"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="rounded-2xl bg-white px-4 py-2.5 shadow-[0_8px_24px_rgba(80,50,35,0.06)]">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500">Starts</span>
            <input
              type="date"
              value={start}
              min={today}
              onChange={(e) => setStart(e.target.value)}
              className="w-full bg-transparent text-[15px] font-semibold text-neutral-900 outline-none"
            />
          </label>
          <DaysStepper days={days} onChange={setDays} />
        </div>

        <ItineraryDays start={start} days={days} onChange={setDays} />
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-linen via-linen to-linen/0 pt-6">
        <div className="mx-auto max-w-xl space-y-2.5 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6">
          {error ? (
            <p className="text-center text-[13px] font-medium text-rose-700">{error}</p>
          ) : (
            <p className="truncate text-center text-[13px] font-medium text-neutral-500">
              {start ? `${tripLabel(start, days.length)} — invite people once it's on your calendar` : "Pick a start date"}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={sending}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-fuchsia-700 text-[16px] font-semibold text-white shadow-[0_12px_26px_rgba(181,82,74,0.25)] transition hover:bg-fuchsia-800 disabled:opacity-70"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Add to calendar
            {!sending && <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.4} />}
          </button>
        </div>
      </footer>
    </>
  );
}
