"use client";

import { useState } from "react";
import { BedDouble, Clock, Minus, Plus } from "lucide-react";
import { addDays, dayLabel, isSlot, MAX_DAYS, MAX_ITEMS, SLOTS, timeLabel, type ItinDay, type Slot } from "@/lib/itinerary";

/** Form rows, before cleaning: blanks are allowed while typing. */
export interface DraftItem {
  /** "" | "HH:MM" | Slot */
  time: string;
  title: string;
  /** Kept from older itineraries; not edited here. */
  place: string;
}
export interface DraftDay {
  items: DraftItem[];
  stay: string;
}

const MIN_ROWS = 3;
export const blankItem = (): DraftItem => ({ time: "", title: "", place: "" });
export const blankDay = (): DraftDay => ({ items: Array.from({ length: MIN_ROWS }, blankItem), stay: "" });

/** Always at least three rows, plus one empty row once the last is used (up to the limit). */
function padRows(items: DraftItem[]): DraftItem[] {
  const out = [...items];
  while (out.length < MIN_ROWS) out.push(blankItem());
  const last = out[out.length - 1];
  if ((last.title.trim() || last.time) && out.length < MAX_ITEMS) out.push(blankItem());
  return out;
}

export function toDraft(days: ItinDay[]): DraftDay[] {
  return days.map((d) => ({
    items: padRows(d.items.map((i) => ({ time: i.time ?? "", title: i.title, place: i.place ?? "" }))),
    stay: d.stay ?? "",
  }));
}

export function fromDraft(days: DraftDay[]): ItinDay[] {
  return days.map((d) => ({
    items: d.items
      .filter((i) => i.title.trim())
      .map((i) => ({ time: i.time || null, title: i.title.trim(), place: i.place.trim() || null })),
    stay: d.stay.trim() || null,
  }));
}

/** − 3 + : how many days. Removing a day drops its rows. */
export function DaysStepper({ days, onChange }: { days: DraftDay[]; onChange: (next: DraftDay[]) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-2 shadow-[0_8px_24px_rgba(80,50,35,0.06)]">
      <span>
        <span className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500">Days</span>
        <span className="text-[15px] font-semibold tabular-nums text-neutral-900">{days.length}</span>
      </span>
      <span className="flex gap-1.5">
        <button
          type="button"
          onClick={() => days.length > 1 && onChange(days.slice(0, -1))}
          disabled={days.length <= 1}
          aria-label="One day fewer"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200/70 text-neutral-900 disabled:opacity-40"
        >
          <Minus className="h-4 w-4" strokeWidth={2.6} />
        </button>
        <button
          type="button"
          onClick={() => days.length < MAX_DAYS && onChange([...days, blankDay()])}
          disabled={days.length >= MAX_DAYS}
          aria-label="One more day"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-white disabled:opacity-40"
        >
          <Plus className="h-4 w-4" strokeWidth={2.6} />
        </button>
      </span>
    </div>
  );
}

/** Day cards: three "time | what" rows ready to type, and a Stay line at the bottom. */
export function ItineraryDays({
  start,
  days,
  onChange,
}: {
  start: string;
  days: DraftDay[];
  onChange: (next: DraftDay[]) => void;
}) {
  const [picking, setPicking] = useState<{ d: number; i: number } | null>(null);

  const setDay = (d: number, next: DraftDay) => onChange(days.map((day, di) => (di === d ? next : day)));
  const setItem = (d: number, i: number, patch: Partial<DraftItem>) => {
    const day = days[d];
    setDay(d, { ...day, items: padRows(day.items.map((it, ii) => (ii === i ? { ...it, ...patch } : it))) });
  };
  const picked = picking ? days[picking.d]?.items[picking.i] : null;

  return (
    <div className="space-y-3">
      {days.map((day, d) => {
        const prevStay = d > 0 ? days[d - 1].stay.trim() : "";
        return (
          <section key={d} className="overflow-hidden rounded-[18px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
            <h3 className="px-4 pb-2 pt-3 text-[16px] font-bold text-neutral-900">
              Day {d + 1}
              {start && <span className="font-semibold text-neutral-500"> · {dayLabel(addDays(start, d))}</span>}
            </h3>
            <ul>
              {day.items.map((it, i) => (
                <li key={i} className="flex items-center gap-2.5 border-t border-neutral-100 px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => setPicking({ d, i })}
                    aria-label={`Day ${d + 1}, row ${i + 1}: ${it.time ? timeLabel(it.time) : "set a time"}`}
                    className={`flex h-9 w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-bold ${
                      it.time ? "bg-orange-50 text-fuchsia-800" : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    {it.time && !isSlot(it.time) && <Clock className="h-3.5 w-3.5" strokeWidth={2.4} />}
                    {it.time ? timeLabel(it.time) : "Time"}
                  </button>
                  <input
                    value={it.title}
                    onChange={(e) => setItem(d, i, { title: e.target.value })}
                    placeholder="What's happening?"
                    maxLength={80}
                    aria-label={`Day ${d + 1}, row ${i + 1}`}
                    className="h-9 min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400"
                  />
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2.5 border-t border-neutral-100 bg-orange-50/40 px-3 py-1.5">
              <span className="flex h-9 w-[96px] shrink-0 items-center justify-center gap-1.5 text-[13px] font-bold text-neutral-600">
                <BedDouble className="h-4 w-4" /> Stay
              </span>
              <input
                value={day.stay}
                onChange={(e) => setDay(d, { ...day, stay: e.target.value })}
                placeholder="Where you're sleeping"
                maxLength={80}
                aria-label={`Day ${d + 1}, where you're staying`}
                className="h-9 min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400"
              />
              {!day.stay.trim() && prevStay && (
                <button
                  type="button"
                  onClick={() => setDay(d, { ...day, stay: prevStay })}
                  className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-neutral-600 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                >
                  Same as Day {d}
                </button>
              )}
            </div>
          </section>
        );
      })}

      {picking && picked && (
        <TimeSheet
          title={`Day ${picking.d + 1}${picked.title.trim() ? ` · ${picked.title.trim()}` : ""}`}
          value={picked.time}
          onPick={(time) => {
            setItem(picking.d, picking.i, { time });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

const SLOT_HINT: Record<Slot, string> = { morning: "before noon", afternoon: "noon – 5", night: "after 5" };
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "15", "30", "45"];

/** Morning / Afternoon / Night, or an exact time (hour : minute + AM/PM). */
function TimeSheet({
  title,
  value,
  onPick,
  onClose,
}: {
  title: string;
  value: string;
  onPick: (time: string) => void;
  onClose: () => void;
}) {
  const clock = /^\d\d:\d\d$/.test(value) ? value.split(":").map(Number) : [9, 0];
  const [hour, setHour] = useState(((clock[0] + 11) % 12) + 1);
  const [minute, setMinute] = useState(MINUTES.includes(String(clock[1]).padStart(2, "0")) ? String(clock[1]).padStart(2, "0") : "00");
  const [pm, setPm] = useState(clock[0] >= 12);
  const exact = `${String((hour % 12) + (pm ? 12 : 0)).padStart(2, "0")}:${minute}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pick a time"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-[24px] bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(60,35,25,0.18)] sm:rounded-[24px] sm:pb-6"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-neutral-200" aria-hidden />
        <p className="mb-2 truncate text-[13px] font-bold text-neutral-500">{title}</p>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              aria-pressed={value === s}
              className={`flex h-[54px] flex-col items-center justify-center rounded-[14px] text-[15px] font-bold ${
                value === s ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900"
              }`}
            >
              {timeLabel(s)}
              <span className={`text-[11px] font-medium ${value === s ? "text-white/70" : "text-neutral-500"}`}>{SLOT_HINT[s]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-[14px] bg-neutral-100 px-3 py-2.5">
          <Clock className="h-4 w-4 shrink-0 text-fuchsia-800" strokeWidth={2.4} />
          <span className="flex-1 text-[15px] font-semibold text-neutral-900">Exact time</span>
          <select
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            aria-label="Hour"
            className="h-9 rounded-lg bg-white px-2 text-[17px] font-bold tabular-nums outline-none"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <span className="text-[17px] font-bold">:</span>
          <select
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            aria-label="Minutes"
            className="h-9 rounded-lg bg-white px-2 text-[17px] font-bold tabular-nums outline-none"
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span className="flex rounded-full bg-white p-0.5">
            {(["AM", "PM"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPm(k === "PM")}
                aria-pressed={pm === (k === "PM")}
                className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${
                  pm === (k === "PM") ? "bg-neutral-900 text-white" : "text-neutral-500"
                }`}
              >
                {k}
              </button>
            ))}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={() => onPick("")} className="h-10 text-[14px] font-bold text-neutral-500">
            Clear time
          </button>
          <button
            type="button"
            onClick={() => onPick(exact)}
            className="h-10 rounded-full bg-neutral-900 px-5 text-[14px] font-bold text-white"
          >
            Set {timeLabel(exact)}
          </button>
        </div>
      </div>
    </div>
  );
}
