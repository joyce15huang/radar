"use client";

import { useMemo, useState } from "react";
import type { DigestCardData } from "@/lib/types";
import { cardIso, dayInTz } from "@/lib/calendarSort";
import { ScheduleQuickAdd } from "./ScheduleQuickAdd";
import { CalendarList } from "./CalendarList";

type Tab = "upcoming" | "past";

const DAY_MS = 86_400_000;

// Include type + status so a promotion (time_window → social_invite) or an RSVP
// remounts the list with the fresh server data instead of stale local state.
function sig(cards: DigestCardData[]): string {
  return cards.map((c) => `${c.id}:${c.type}:${c.status}`).join("|") || "empty";
}

export function CalendarView({
  upcoming,
  past,
  tz,
  viewerId,
}: {
  upcoming: DigestCardData[];
  past: DigestCardData[];
  tz: string;
  viewerId: string;
}) {
  const [tab, setTab] = useState<Tab>("upcoming");

  return (
    <>
      <WeekStrip cards={upcoming} tz={tz} onPick={() => setTab("upcoming")} />
      <ScheduleQuickAdd />

      <div className="mb-5 inline-flex rounded-full bg-neutral-200/60 p-1">
        <SegButton active={tab === "upcoming"} onClick={() => setTab("upcoming")} label="Upcoming" count={upcoming.length} />
        <SegButton active={tab === "past"} onClick={() => setTab("past")} label="Past" count={past.length} />
      </div>

      {tab === "upcoming" ? (
        <CalendarList key={`u:${sig(upcoming)}`} initial={upcoming} variant="upcoming" tz={tz} viewerId={viewerId} />
      ) : (
        <CalendarList key={`p:${sig(past)}`} initial={past} variant="past" tz={tz} viewerId={viewerId} />
      )}
    </>
  );
}

/** The next 7 days; a dot marks days with plans. Tapping scrolls the agenda. */
function WeekStrip({ cards, tz, onPick }: { cards: DigestCardData[]; tz: string; onPick: () => void }) {
  const days = useMemo(() => {
    const now = Date.now();
    return Array.from({ length: 7 }, (_, i) => {
      const ms = now + i * DAY_MS;
      const key = dayInTz(ms, tz) ?? new Date(ms).toISOString().slice(0, 10);
      const [y, m, d] = key.split("-").map(Number);
      const noon = new Date(Date.UTC(y, m - 1, d, 12));
      return {
        key,
        dow: noon.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase(),
        day: d,
      };
    });
  }, [tz]);

  const busyDays = useMemo(() => {
    const s = new Set<string>();
    for (const c of cards) {
      const iso = cardIso(c);
      const day = iso ? dayInTz(iso, tz) : null;
      if (day) s.add(day);
    }
    return s;
  }, [cards, tz]);

  const [selected, setSelected] = useState(days[0]?.key ?? "");

  function pick(key: string) {
    setSelected(key);
    onPick();
    requestAnimationFrame(() =>
      document.getElementById(`day-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  return (
    <div className="mb-4 grid grid-cols-7 gap-1">
      {days.map((d) => {
        const on = d.key === selected;
        const has = busyDays.has(d.key);
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => pick(d.key)}
            aria-pressed={on}
            aria-label={`${d.dow} ${d.day}${has ? ", has plans" : ""}`}
            className={`flex flex-col items-center gap-1.5 rounded-2xl py-2 transition ${
              on ? "bg-neutral-900" : "hover:bg-neutral-200/60"
            }`}
          >
            <span className={`text-[11px] font-semibold ${on ? "text-neutral-300" : "text-neutral-500"}`}>{d.dow}</span>
            <span className={`text-[17px] font-semibold ${on ? "text-white" : "text-neutral-900"}`}>{d.day}</span>
            <span
              className={`h-1.5 w-1.5 rounded-full ${has ? (on ? "bg-white" : "bg-fuchsia-600") : "bg-transparent"}`}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

function SegButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors ${
        active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"
      }`}
    >
      {label}
      {count > 0 && <span className={active ? "text-neutral-500" : "text-neutral-500"}>{count}</span>}
    </button>
  );
}
