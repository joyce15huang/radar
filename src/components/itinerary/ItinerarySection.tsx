"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin } from "lucide-react";
import { clientTimeZone } from "@/lib/localDateTime";
import { addDays, dayLabel, timeLabel, type ItinDay } from "@/lib/itinerary";
import { updateItinerary } from "@/app/itinerary-actions";
import { ItineraryDays, fromDraft, toDraft, type DraftDay } from "./ItineraryDays";

/** The plan page's day-by-day timeline. The host can edit the days in place. */
export function ItinerarySection({
  eventId,
  start,
  days,
  isHost,
}: {
  eventId: string;
  start: string;
  days: ItinDay[];
  isHost: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftDay[]>(() => toDraft(days));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updateItinerary({ eventId, tz: clientTimeZone(), days: fromDraft(draft) });
    setSaving(false);
    if (!res.ok) return setError(res.error ?? "Couldn't save the days.");
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">
          Itinerary <span className="font-semibold text-neutral-500">· {days.length} {days.length === 1 ? "day" : "days"}</span>
        </h2>
        {isHost && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(toDraft(days));
              setEditing(true);
            }}
            className="h-9 rounded-full bg-neutral-200/70 px-4 text-[13px] font-bold text-neutral-900"
          >
            Edit days
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <ItineraryDays start={start} days={draft} onChange={setDraft} />
          {error && <p className="text-[13px] font-medium text-rose-700">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="h-12 rounded-2xl bg-neutral-200/70 text-[15px] font-semibold text-neutral-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-[15px] font-semibold text-white disabled:opacity-70"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save days
            </button>
          </div>
        </div>
      ) : (
        <ol className="rounded-[18px] bg-white px-4 pb-2 pt-4 shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
          {days.map((day, d) => (
            <li key={d} className="flex gap-3">
              <div className="flex w-[30px] flex-col items-center">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-neutral-900 text-[13px] font-bold text-white">
                  {d + 1}
                </span>
                {d < days.length - 1 && <span className="my-1 w-0.5 flex-1 bg-neutral-200" aria-hidden />}
              </div>
              <div className="min-w-0 flex-1 pb-3">
                <h3 className="pt-1 text-[15px] font-bold text-neutral-900">
                  Day {d + 1} <span className="font-semibold text-neutral-500">· {dayLabel(addDays(start, d))}</span>
                </h3>
                {day.items.length === 0 ? (
                  <p className="py-2 text-[14px] text-neutral-400">Free day</p>
                ) : (
                  <ul>
                    {day.items.map((it, i) => (
                      <li key={i} className="flex gap-3 py-2">
                        <span className="w-[62px] shrink-0 text-[14px] font-bold text-fuchsia-800">{timeLabel(it.time)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-neutral-900">{it.title}</span>
                          {it.place && (
                            <span className="flex items-center gap-1 text-[13px] text-neutral-500">
                              <MapPin className="h-3 w-3 shrink-0" /> {it.place}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
