import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedCard } from "./anthropic";
import { dedupKey, normalizeLocation, resolveTiming } from "./dedup";

/** A row in the shared `sourced_events` pool (server-only). */
export interface PoolEvent {
  dedup_key: string;
  location: string;
  kind: "scout" | "time_window";
  category: string;
  title: string;
  summary: string;
  action_label: string;
  action_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  prune_at: string;
  expires_at: string | null;
  opens_at: string | null;
  window_label: string | null;
  source_domain: string | null;
}

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Map a freshly generated card into a pool row for a given location. */
export function poolRowFromCard(
  card: GeneratedCard,
  location: string,
  nowMs: number,
): PoolEvent {
  const t = resolveTiming(card, nowMs);
  return {
    dedup_key: dedupKey({
      title: card.title,
      location,
      opensAt: t.opensAt,
      expiresAt: t.expiresAt,
    }),
    location: normalizeLocation(location),
    kind: card.kind === "time_window" ? "time_window" : "scout",
    category: card.category,
    title: card.title,
    summary: card.summary,
    action_label: card.action_label,
    action_url: card.action_url,
    starts_at: t.opensAt,
    ends_at: t.expiresAt,
    prune_at: t.pruneAt,
    expires_at: t.expiresAt,
    opens_at: t.opensAt,
    window_label: t.windowLabel,
    source_domain: domainOf(card.action_url),
  };
}

/**
 * Insert freshly generated events into the shared pool. Existing dedup_keys are
 * left untouched (ignoreDuplicates) so a re-sourced gem keeps its original
 * shelf-life and a real event keeps its source date.
 */
export async function upsertPoolEvents(
  admin: SupabaseClient,
  location: string,
  cards: GeneratedCard[],
  nowMs: number,
): Promise<void> {
  if (!cards.length) return;
  const byKey = new Map<string, PoolEvent>();
  for (const c of cards) {
    const row = poolRowFromCard(c, location, nowMs);
    byKey.set(row.dedup_key, row);
  }
  const nowISO = new Date(nowMs).toISOString();
  await admin.from("sourced_events").upsert(
    [...byKey.values()].map((r) => ({ ...r, last_seen: nowISO })),
    { onConflict: "dedup_key", ignoreDuplicates: true },
  );
}

/**
 * Draw up to `limit` future pool events for the given locations, excluding any
 * dedup_key the caller already holds. Soonest-ending first.
 */
export async function drawFromPool(
  admin: SupabaseClient,
  locations: string[],
  excludeKeys: Set<string>,
  startISO: string,
  limit: number,
): Promise<PoolEvent[]> {
  const locs = [...new Set(locations.map(normalizeLocation).filter(Boolean))];
  if (!locs.length || limit <= 0) return [];
  const { data } = await admin
    .from("sourced_events")
    .select("*")
    .in("location", locs)
    .gt("prune_at", startISO)
    .order("prune_at", { ascending: true })
    .limit(limit + excludeKeys.size + 10);
  const rows = (data ?? []) as PoolEvent[];
  const out: PoolEvent[] = [];
  for (const r of rows) {
    if (excludeKeys.has(r.dedup_key)) continue;
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** True if this location was already sourced today (on/after startISO). */
export async function wasSourcedToday(
  admin: SupabaseClient,
  location: string,
  startISO: string,
): Promise<boolean> {
  const { data } = await admin
    .from("sourcing_runs")
    .select("last_sourced_at")
    .eq("location", normalizeLocation(location))
    .maybeSingle();
  const last = (data as { last_sourced_at: string } | null)?.last_sourced_at;
  return Boolean(last) && Date.parse(last as string) >= Date.parse(startISO);
}

/** Record that a location was sourced at nowISO. */
export async function markSourced(
  admin: SupabaseClient,
  location: string,
  nowISO: string,
): Promise<void> {
  await admin
    .from("sourcing_runs")
    .upsert(
      { location: normalizeLocation(location), last_sourced_at: nowISO },
      { onConflict: "location" },
    );
}
