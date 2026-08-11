"use client";

import { useState } from "react";
import type { DigestCardData } from "@/lib/types";
import { ScheduleQuickAdd } from "./ScheduleQuickAdd";
import { CalendarList } from "./CalendarList";

type Tab = "upcoming" | "past";

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
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
        <SegButton
          active={tab === "upcoming"}
          onClick={() => setTab("upcoming")}
          label="Upcoming"
          count={upcoming.length}
        />
        <SegButton
          active={tab === "past"}
          onClick={() => setTab("past")}
          label="Past"
          count={past.length}
        />
      </div>

      {tab === "upcoming" ? (
        <>
          <ScheduleQuickAdd />
          <CalendarList key={`u:${sig(upcoming)}`} initial={upcoming} variant="upcoming" tz={tz} viewerId={viewerId} />
        </>
      ) : (
        <CalendarList key={`p:${sig(past)}`} initial={past} variant="past" tz={tz} viewerId={viewerId} />
      )}
    </>
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
      className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-950 dark:text-white"
          : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
      }`}
    >
      {label}
      {count > 0 && (
        <span className="text-xs text-neutral-400 dark:text-neutral-500">{count}</span>
      )}
    </button>
  );
}
