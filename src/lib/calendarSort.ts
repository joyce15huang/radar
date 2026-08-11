// Shared calendar ordering + auto-archive helpers. Pure and client-safe.
import type { DigestCardData } from "./types";
import { windowSortKey } from "./timeWindow";

const FALLBACK_TZ = "America/Los_Angeles";

/** The ISO instant a card is anchored to, if any. */
export function cardIso(card: DigestCardData): string | undefined {
  if (card.type === "time_window") return card.expiresAt ?? card.opensAt;
  if (card.type === "social_invite" || card.type === "calendar_radar") return card.startsAt;
  return undefined;
}

/** Sort key: soonest first; undated items last. */
export function startKey(card: DigestCardData): number {
  if (card.type === "time_window") return windowSortKey(card);
  const iso = cardIso(card);
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/** Calendar day (YYYY-MM-DD) in the given timezone, or null for a bad date. */
export function dayInTz(input: string | number | Date, tz: string): string | null {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: FALLBACK_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }
}

/**
 * A card is "past" (auto-archived) once its calendar day has fully passed in the
 * viewer's timezone. Undated cards never archive — they stay in Upcoming.
 */
export function isPastCard(
  card: DigestCardData,
  now: number,
  tz: string,
): boolean {
  const iso = cardIso(card);
  if (!iso) return false;
  const day = dayInTz(iso, tz);
  const today = dayInTz(now, tz);
  if (!day || !today) return false;
  return day < today;
}
