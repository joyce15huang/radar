"use client";

import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { getEventRoster } from "@/app/roster-actions";
import type { Attendee, EventRoster } from "@/lib/roster";

/** Initials from a display name, tolerating a leading "@handle". */
function initialsOf(name: string): string {
  const clean = name.replace(/^@/, "").trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  const chars = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return chars.join("") || "?";
}

const MAX_FACES = 5;

function Face({ attendee }: { attendee: Attendee }) {
  const label = `${attendee.name}${attendee.isHost ? " (host)" : ""} — ${
    attendee.status === "going" ? "going" : "invited"
  }`;
  const base =
    "relative flex h-7 w-7 items-center justify-center rounded-full text-[0.6rem] font-semibold ring-2 ring-white dark:ring-neutral-900";
  const tone = attendee.isHost
    ? "bg-fuchsia-600 text-white"
    : attendee.status === "going"
      ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
      : "border border-dashed border-neutral-300 bg-white text-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-500";
  return (
    <span className={`${base} ${tone}`} title={label} aria-label={label}>
      {initialsOf(attendee.name)}
      {attendee.isHost && (
        <Crown
          className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-white p-[1px] text-fuchsia-600 dark:bg-neutral-900"
          strokeWidth={2.5}
        />
      )}
    </span>
  );
}

/**
 * Partiful-style guest faces for an event invite. Confirmed guests are filled
 * avatars, still-pending invitees are dashed "ghost" avatars, and the host wears
 * a small crown. The roster loads lazily (one query per event) so the calendar
 * list stays cheap; a skeleton reserves the height to avoid layout shift.
 */
export function GuestFaces({ eventId }: { eventId: string }) {
  const [roster, setRoster] = useState<EventRoster | null | "loading">("loading");

  useEffect(() => {
    let active = true;
    getEventRoster(eventId)
      .then((r) => {
        if (active) setRoster(r);
      })
      .catch(() => {
        if (active) setRoster(null);
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  if (roster === "loading") {
    return (
      <div className="flex -space-x-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-7 w-7 animate-pulse rounded-full bg-neutral-200 ring-2 ring-white dark:bg-neutral-800 dark:ring-neutral-900"
          />
        ))}
      </div>
    );
  }
  if (!roster) return null;

  const faces = [...roster.going, ...roster.invited].slice(0, MAX_FACES);
  const overflow = roster.going.length + roster.invited.length - faces.length;
  const caption =
    `${roster.goingCount} going` +
    (roster.invitedCount > 0 ? ` · ${roster.invitedCount} invited` : "");

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {faces.map((a) => (
          <Face key={a.id} attendee={a} />
        ))}
        {overflow > 0 && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-[0.6rem] font-semibold text-neutral-500 ring-2 ring-white dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-900">
            +{overflow}
          </span>
        )}
      </div>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{caption}</span>
    </div>
  );
}
