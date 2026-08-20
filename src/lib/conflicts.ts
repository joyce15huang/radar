// Deterministic calendar-conflict check for Today cards. Pure + client-safe.
// A pending card with a concrete clock time is compared against the busy blocks
// the user has already accepted onto their calendar; if any overlap on the same
// instant range, the card shows "Conflict with <event>" instead of "No conflict".
import type { DigestCardData } from "./types";

/** Default block length (minutes) for an event that has a start but no end. */
export const DEFAULT_BLOCK_MIN = 90;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True only when the ISO carries a wall-clock time (not a bare calendar day). */
export function isoHasClock(iso?: string | null): boolean {
  if (!iso) return false;
  const s = String(iso).trim();
  return !DATE_ONLY.test(s) && /T\d{2}:\d{2}/.test(s);
}

export interface BusyInterval {
  title: string;
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string | null;
}

/**
 * Extract the occupied time interval from a card, or null when it has no
 * concrete clock time (undated / day-only cards never conflict). Used for both
 * the accepted calendar (the "busy" set) and the pending card being checked.
 */
export function busyFromCard(
  card: DigestCardData,
  defaultMin: number = DEFAULT_BLOCK_MIN,
): BusyInterval | null {
  let startIso: string | undefined;
  let endIso: string | null = null;
  let title = "";

  if (card.type === "social_invite") {
    startIso = card.startsAt ?? card.opensAt;
    endIso = card.expiresAt ?? null;
    title = card.eventTitle || "an event";
  } else if (card.type === "calendar_radar") {
    startIso = card.startsAt;
    title = card.title || "an event";
  } else if (card.type === "time_window") {
    startIso = card.opensAt ?? card.expiresAt;
    endIso = card.expiresAt ?? null;
    title = card.title || "an event";
  } else {
    return null;
  }

  if (!isoHasClock(startIso)) return null;
  const startMs = Date.parse(startIso as string);
  if (Number.isNaN(startMs)) return null;

  let endMs = endIso && isoHasClock(endIso) ? Date.parse(endIso) : NaN;
  if (Number.isNaN(endMs) || endMs <= startMs) {
    endMs = startMs + defaultMin * 60_000;
    endIso = null;
  }

  return { title, startMs, endMs, startIso: startIso as string, endIso };
}

/** Half-open overlap test: [aStart,aEnd) ∩ [bStart,bEnd) ≠ ∅. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** The first busy block that overlaps [startMs,endMs), or null if the slot is free. */
export function findConflict(
  startMs: number,
  endMs: number,
  busy: BusyInterval[],
): BusyInterval | null {
  for (const b of busy) {
    if (overlaps(startMs, endMs, b.startMs, b.endMs)) return b;
  }
  return null;
}

function fmtTime(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })
    .replace(":00", "");
}

/** "1–2 PM" when an end is known, else just the start ("1 PM"). */
export function formatBusyRange(b: BusyInterval, tz: string): string {
  const start = fmtTime(b.startIso, tz);
  if (b.endIso && isoHasClock(b.endIso)) {
    const end = fmtTime(b.endIso, tz);
    if (end) return `${start}–${end}`;
  }
  return start;
}
