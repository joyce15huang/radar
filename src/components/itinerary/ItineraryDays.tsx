"use client";

import { Plus, X, MapPin } from "lucide-react";
import { addDays, dayLabel, MAX_DAYS, MAX_ITEMS, type ItinDay } from "@/lib/itinerary";

/** Form rows, before cleaning: blanks are allowed while typing. */
export interface DraftItem {
  time: string;
  title: string;
  place: string;
}
export interface DraftDay {
  items: DraftItem[];
}

export const blankItem = (): DraftItem => ({ time: "", title: "", place: "" });

export function toDraft(days: ItinDay[]): DraftDay[] {
  return days.map((d) => ({
    items: d.items.length
      ? d.items.map((i) => ({ time: i.time ?? "", title: i.title, place: i.place ?? "" }))
      : [blankItem()],
  }));
}

export function fromDraft(days: DraftDay[]): ItinDay[] {
  return days.map((d) => ({
    items: d.items
      .filter((i) => i.title.trim())
      .map((i) => ({ time: i.time || null, title: i.title.trim(), place: i.place.trim() || null })),
  }));
}

/** Day 1, Day 2 … each a card of typed rows: time (optional), what, where (optional). */
export function ItineraryDays({
  start,
  days,
  onChange,
}: {
  start: string;
  days: DraftDay[];
  onChange: (next: DraftDay[]) => void;
}) {
  const setItem = (d: number, i: number, patch: Partial<DraftItem>) =>
    onChange(days.map((day, di) => (di !== d ? day : { items: day.items.map((it, ii) => (ii === i ? { ...it, ...patch } : it)) })));
  const addItem = (d: number) =>
    onChange(days.map((day, di) => (di === d && day.items.length < MAX_ITEMS ? { items: [...day.items, blankItem()] } : day)));
  const removeItem = (d: number, i: number) =>
    onChange(
      days.map((day, di) => {
        if (di !== d) return day;
        const items = day.items.filter((_, ii) => ii !== i);
        return { items: items.length ? items : [blankItem()] };
      }),
    );

  return (
    <div className="space-y-3">
      {days.map((day, d) => (
        <section key={d} className="overflow-hidden rounded-[18px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
          <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3">
            <h3 className="text-[16px] font-bold text-neutral-900">
              Day {d + 1}
              {start && <span className="font-semibold text-neutral-500"> · {dayLabel(addDays(start, d))}</span>}
            </h3>
            {d === days.length - 1 && days.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(days.slice(0, -1))}
                className="text-[13px] font-semibold text-neutral-500 hover:text-neutral-800"
              >
                Remove day
              </button>
            )}
          </div>
          <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
            {day.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2 py-2 pl-3 pr-1.5">
                <input
                  type="time"
                  value={it.time}
                  onChange={(e) => setItem(d, i, { time: e.target.value })}
                  aria-label={`Day ${d + 1}, item ${i + 1} time (optional)`}
                  className="mt-0.5 h-9 w-[104px] shrink-0 rounded-lg bg-neutral-100 px-2 text-[14px] font-semibold text-fuchsia-800 outline-none"
                />
                <div className="min-w-0 flex-1">
                  <input
                    value={it.title}
                    onChange={(e) => setItem(d, i, { title: e.target.value })}
                    placeholder="What's happening?"
                    maxLength={80}
                    aria-label={`Day ${d + 1}, item ${i + 1}`}
                    className="h-9 w-full bg-transparent text-[15px] font-semibold text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400"
                  />
                  <label className="flex h-7 items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    <input
                      value={it.place}
                      onChange={(e) => setItem(d, i, { place: e.target.value })}
                      placeholder="Where (optional)"
                      maxLength={80}
                      aria-label={`Day ${d + 1}, item ${i + 1} place`}
                      className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-600 outline-none placeholder:text-neutral-400"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(d, i)}
                  aria-label={`Remove item ${i + 1} from day ${d + 1}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => addItem(d)}
            className="flex h-11 w-full items-center gap-1.5 px-4 text-[14px] font-bold text-fuchsia-800"
          >
            <Plus className="h-4 w-4" /> Add to Day {d + 1}
          </button>
        </section>
      ))}
      {days.length < MAX_DAYS && (
        <button
          type="button"
          onClick={() => onChange([...days, { items: [blankItem()] }])}
          className="flex h-12 w-full items-center justify-center gap-1.5 rounded-[18px] bg-white text-[15px] font-bold text-neutral-900 shadow-[0_8px_24px_rgba(80,50,35,0.07)]"
        >
          <Plus className="h-4 w-4" /> Add Day {days.length + 1}
        </button>
      )}
    </div>
  );
}
