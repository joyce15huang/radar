import type { GeneratedCard } from "./anthropic";
import { SHELF_LIFE_DAYS, addDays, localMidnightISO, ymd } from "@/lib/time";

const DAY_MS = 86_400_000;

/** Lowercase, strip punctuation, collapse whitespace — for stable matching. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Normalize a location so "San Francisco, CA" and "san francisco ca" collapse. */
export function normalizeLocation(location: string): string {
  return normalize(location);
}

/**
 * Real timing distilled from a generated card, plus the prune boundary that lets
 * every card age out. Dates come only from the source (the model's opens_at /
 * expires_at); the sole synthesized value is a dateless gem's shelf-life prune_at.
 */
export interface ResolvedTiming {
  opensAt: string | null;
  expiresAt: string | null;
  windowLabel: string | null;
  /** Local midnight AFTER the last real day, or now + shelf-life for a gem. */
  pruneAt: string;
}

export function resolveTiming(card: GeneratedCard, nowMs: number): ResolvedTiming {
  const opensAt = card.opens_at ?? null;
  const expiresAt = card.expires_at ?? null;
  const lastReal = expiresAt ?? opensAt ?? null;
  const lastDay = ymd(lastReal);
  const pruneAt = lastDay
    ? localMidnightISO(addDays(lastDay, 1))
    : new Date(nowMs + SHELF_LIFE_DAYS * DAY_MS).toISOString();
  return { opensAt, expiresAt, windowLabel: card.window_label ?? null, pruneAt };
}

/**
 * A stable identity for one real opportunity: normalized title + its day (from
 * the source date, day granularity) + normalized location. Dateless gems key on
 * title + location (day = "undated") so they, too, never reappear once dismissed.
 */
export function dedupKey(input: {
  title: string;
  location: string;
  opensAt?: string | null;
  expiresAt?: string | null;
}): string {
  const day = ymd(input.opensAt) || ymd(input.expiresAt) || "undated";
  return [normalize(input.title), day, normalizeLocation(input.location)].join("|");
}
