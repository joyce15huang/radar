"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Check } from "lucide-react";

export interface WhenValue {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** "HH:MM" (24h). */
  start: string;
  end: string;
  allDay: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymdOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fromMin = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

/** "7:00 PM" from "19:00". */
export function timeLabel(hhmm: string): string {
  const min = toMin(hhmm);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}
/** "Sat, Oct 10" from "2026-10-10". */
function dateLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "Pick a date";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}
function duration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = mins / 60;
  return Number.isInteger(h) ? `${h} hr` : `${h.toFixed(1)} hrs`;
}

const SLOTS = Array.from({ length: 96 }, (_, i) => fromMin(i * 15));

/**
 * Calendar-style When: a date field, start – end times, and an All day switch.
 * Tapping the date opens a month view; tapping a time opens a 15-minute list.
 */
export function WhenPicker({
  value,
  onChange,
  today,
  footerRight,
}: {
  value: WhenValue;
  onChange: (v: WhenValue) => void;
  /** Today's YYYY-MM-DD in the user's time zone (past days are disabled). */
  today: string;
  /** Optional element on the right of the All-day row (e.g. "Let them vote instead"). */
  footerRight?: React.ReactNode;
}) {
  const [open, setOpen] = useState<null | "date" | "start" | "end">(null);
  const set = (patch: Partial<WhenValue>) => onChange({ ...value, ...patch });

  // Moving the start keeps the same length of plan.
  const setStart = (start: string) => {
    const len = Math.max(15, toMin(value.end) - toMin(value.start));
    set({ start, end: fromMin(Math.min(toMin(start) + len, 23 * 60 + 45)), allDay: false });
  };

  const field = (on: boolean, dim = false) =>
    `h-12 rounded-xl bg-white text-[15px] font-semibold transition ${
      on ? "shadow-[0_0_0_2px_#2E211D]" : "shadow-[0_1px_2px_rgba(80,50,35,0.08)]"
    } ${dim ? "text-neutral-400" : "text-neutral-900"}`;

  return (
    <div className="relative space-y-2.5">
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} aria-hidden />}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(open === "date" ? null : "date")}
          aria-expanded={open === "date"}
          className={`${field(open === "date")} flex min-w-0 flex-1 items-center gap-2 px-3`}
        >
          <CalendarDays className="h-[17px] w-[17px] shrink-0 text-neutral-500" />
          <span className="truncate">{dateLabel(value.date)}</span>
        </button>
        {!value.allDay && (
          <>
            <button
              type="button"
              onClick={() => setOpen(open === "start" ? null : "start")}
              aria-expanded={open === "start"}
              aria-label="Start time"
              className={`${field(open === "start")} w-[88px] shrink-0`}
            >
              {timeLabel(value.start)}
            </button>
            <span className="font-semibold text-neutral-400">–</span>
            <button
              type="button"
              onClick={() => setOpen(open === "end" ? null : "end")}
              aria-expanded={open === "end"}
              aria-label="End time"
              className={`${field(open === "end", true)} w-[88px] shrink-0 !text-neutral-600`}
            >
              {timeLabel(value.end)}
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between px-1">
        <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-semibold text-neutral-900">
          <input
            type="checkbox"
            checked={value.allDay}
            onChange={(e) => set({ allDay: e.target.checked })}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={`relative h-6 w-10 rounded-full transition ${value.allDay ? "bg-neutral-900" : "bg-neutral-300"} peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-400`}
          >
            <span
              className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${
                value.allDay ? "left-[19px]" : "left-[3px]"
              }`}
            />
          </span>
          All day
        </label>
        {footerRight}
      </div>

      {open === "date" && (
        <MonthPopover
          value={value.date}
          today={today}
          onPick={(date) => {
            set({ date });
            setOpen(null);
          }}
        />
      )}
      {open === "start" && (
        <TimePopover
          align="start"
          options={SLOTS.map((t) => ({ value: t, label: timeLabel(t) }))}
          selected={value.start}
          onPick={(t) => {
            setStart(t);
            setOpen(null);
          }}
        />
      )}
      {open === "end" && (
        <TimePopover
          align="end"
          options={SLOTS.filter((t) => toMin(t) > toMin(value.start)).map((t) => ({
            value: t,
            label: timeLabel(t),
            hint: duration(toMin(t) - toMin(value.start)),
          }))}
          selected={value.end}
          onPick={(t) => {
            set({ end: t });
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function MonthPopover({ value, today, onPick }: { value: string; today: string; onPick: (ymd: string) => void }) {
  const [vy, vm] = (value || today).split("-").map(Number);
  const [cursor, setCursor] = useState({ y: vy, m: vm - 1 });
  const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
  const lead = first.getUTCDay();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(Date.UTC(cursor.y, cursor.m, 1 - lead + i));
    return { ymd: ymdOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), day: d.getUTCDate(), inMonth: d.getUTCMonth() === cursor.m };
  });
  const title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const shift = (n: number) => setCursor((c) => {
    const d = new Date(Date.UTC(c.y, c.m + n, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  // Quick picks: today, tomorrow, and the coming Saturday.
  const [ty, tm, td] = today.split("-").map(Number);
  const t0 = Date.UTC(ty, tm - 1, td);
  const plus = (n: number) => {
    const d = new Date(t0 + n * 86_400_000);
    return ymdOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  const toSat = (6 - new Date(t0).getUTCDay() + 7) % 7 || 7;

  return (
    <div className="absolute inset-x-0 top-[56px] z-50 rounded-[20px] bg-white p-3 shadow-[0_18px_44px_rgba(46,33,29,0.18),0_2px_6px_rgba(46,33,29,0.06)]">
      <div className="flex items-center justify-between px-1.5 pb-2">
        <span className="text-[16px] font-bold text-neutral-900">{title}</span>
        <span className="flex gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-neutral-100">
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-neutral-100">
            <ChevronRight className="h-[18px] w-[18px]" />
          </button>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="pb-1.5 text-[11px] font-bold text-neutral-500">{d}</span>
        ))}
        {cells.map((c) => {
          const past = c.ymd < today;
          const sel = c.ymd === value;
          const isToday = c.ymd === today;
          return (
            <button
              key={c.ymd}
              type="button"
              disabled={past}
              onClick={() => onPick(c.ymd)}
              aria-pressed={sel}
              className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full text-[14px] transition ${
                sel
                  ? "bg-fuchsia-700 font-bold text-white"
                  : past
                    ? "text-neutral-300"
                    : c.inMonth
                      ? `font-medium text-neutral-900 hover:bg-neutral-100 ${isToday ? "ring-1 ring-inset ring-neutral-400" : ""}`
                      : "text-neutral-400 hover:bg-neutral-100"
              }`}
            >
              {c.day}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 border-t border-neutral-100 px-1 pt-2.5">
        {[
          { label: "Today", ymd: today },
          { label: "Tomorrow", ymd: plus(1) },
          { label: "This weekend", ymd: plus(toSat) },
        ].map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => onPick(q.ymd)}
            className="h-[34px] rounded-[10px] bg-neutral-100 px-3 text-[13px] font-semibold text-neutral-900 hover:bg-neutral-200"
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimePopover({
  options,
  selected,
  onPick,
  align,
}: {
  options: { value: string; label: string; hint?: string }[];
  selected: string;
  onPick: (v: string) => void;
  align: "start" | "end";
}) {
  const selRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <div
      className={`absolute top-[56px] z-50 max-h-72 w-[190px] overflow-y-auto overscroll-contain rounded-2xl bg-white p-1.5 shadow-[0_18px_44px_rgba(46,33,29,0.18),0_2px_6px_rgba(46,33,29,0.06)] ${
        align === "start" ? "right-[100px]" : "right-0"
      }`}
    >
      {options.map((o) => {
        const sel = o.value === selected;
        return (
          <button
            key={o.value}
            ref={sel ? selRef : undefined}
            type="button"
            onClick={() => onPick(o.value)}
            className={`flex h-10 w-full items-center justify-between rounded-[10px] px-3 text-left text-[14px] ${
              sel ? "bg-fuchsia-100 font-bold text-fuchsia-800" : "font-medium text-neutral-900 hover:bg-neutral-100"
            }`}
          >
            <span>
              {o.label}
              {o.hint && <span className="ml-1.5 text-[12px] font-medium text-neutral-500">({o.hint})</span>}
            </span>
            {sel && <Check className="h-4 w-4" strokeWidth={2.6} />}
          </button>
        );
      })}
    </div>
  );
}
