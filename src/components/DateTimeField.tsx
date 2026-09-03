"use client";

import { useRef } from "react";
import { CalendarDays } from "lucide-react";
import { weekdayOf } from "@/lib/localDateTime";

export interface DTValue {
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" (24h), or null for an all-day event. */
  time: string | null;
}

const cls =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:ring-neutral-700";

/** Sensible default time so new events are timed unless marked all-day. */
export const DEFAULT_TIME = "18:00";

/** A real calendar + time selection on one line. Timed by default — picking a
 *  date jumps straight to the time; check "All day" to drop the time. Emits a
 *  { date, time } the caller turns into a canonical ISO. */
export function DateTimeField({
  value,
  onChange,
}: {
  value: DTValue;
  onChange: (v: DTValue) => void;
}) {
  const timeRef = useRef<HTMLInputElement>(null);
  const weekday = value.date ? weekdayOf(value.date) : "";
  const allDay = value.time === null;

  function setDate(date: string) {
    onChange({ ...value, date });
    // Auto-advance to the time input so it's not a second click.
    if (!allDay && date) requestAnimationFrame(() => timeRef.current?.focus());
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center text-neutral-400">
        <CalendarDays className="h-4 w-4" />
      </span>
      <input
        type="date"
        value={value.date}
        onChange={(e) => setDate(e.target.value)}
        className={cls}
      />
      {weekday && (
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{weekday}</span>
      )}

      {!allDay && (
        <input
          ref={timeRef}
          type="time"
          value={value.time ?? DEFAULT_TIME}
          onChange={(e) => onChange({ ...value, time: e.target.value })}
          className={cls}
        />
      )}

      <label className="ml-0.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => onChange({ ...value, time: e.target.checked ? null : value.time ?? DEFAULT_TIME })}
          className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400 dark:border-neutral-600"
        />
        All day
      </label>
    </div>
  );
}
