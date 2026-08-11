"use client";

import { CalendarDays, Clock } from "lucide-react";
import { weekdayOf } from "@/lib/localDateTime";

export interface DTValue {
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" (24h) or null for an all-day event. */
  time: string | null;
}

const cls =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:ring-neutral-700";

/** A real calendar + time selection on a single line. Shows the weekday so the
 *  day is never ambiguous; the checkbox (clock) toggles an optional time. Emits a
 *  { date, time } the caller turns into a canonical ISO. */
export function DateTimeField({
  value,
  onChange,
}: {
  value: DTValue;
  onChange: (v: DTValue) => void;
}) {
  const weekday = value.date ? weekdayOf(value.date) : "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center text-neutral-400">
        <CalendarDays className="h-4 w-4" />
      </span>
      <input
        type="date"
        value={value.date}
        onChange={(e) => onChange({ ...value, date: e.target.value })}
        className={cls}
      />
      {weekday && (
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{weekday}</span>
      )}

      <span className="mx-0.5 h-5 w-px bg-neutral-200 dark:bg-neutral-800" aria-hidden />

      <label className="flex items-center gap-1.5" title="Set a time">
        <input
          type="checkbox"
          checked={value.time !== null}
          onChange={(e) => onChange({ ...value, time: e.target.checked ? value.time ?? "18:00" : null })}
          aria-label="Set a time"
          className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400 dark:border-neutral-600"
        />
        <Clock className="h-4 w-4 text-neutral-400" />
      </label>
      {value.time !== null && (
        <input
          type="time"
          value={value.time}
          onChange={(e) => onChange({ ...value, time: e.target.value })}
          className={cls}
        />
      )}
    </div>
  );
}
