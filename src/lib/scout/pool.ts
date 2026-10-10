import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedCard } from "./anthropic";
import { dedupKey, topicKey, normalizeLocation, resolveTiming } from "./dedup";

/** A row in the shared `sourced_events` pool (server-only). */
export interface PoolEvent {
  dedup_key: string;
  /** Looser month-scoped slug for the same event across outlets (may be null). */
  topic_key: string | null;
  location: string;
  kind: "scout" | "time_window";
  category: string;
  title: string;
  summary: string;
  /** Short "Neighborhood, City" (0038); may be absent on older rows. */
  place?: string | null;
  /** "Free" / "$15" / "~$15–25 per person" (0038); may be absent on older rows. */
  cost?: string | null;
  topic: string | null;
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
    topic_key: topicKey({
      topicKey: card.topic_key,
      opensAt: t.opensAt,
      expiresAt: t.expiresAt,
    }),
    location: normalizeLocation(location),
    kind: card.kind === "time_window" ? "time_window" : "scout",
    category: card.category,
    title: card.title,
    summary: card.summary,
    place: card.place?.trim() || null,
    cost: card.cost?.trim() || null,
    topic: card.topic ?? null,
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
  const rows = [...byKey.values()].map((r) => ({ ...r, last_seen: nowISO }));
  const { error } = await admin
    .from("sourced_events")
    .upsert(rows, { onConflict: "dedup_key", ignoreDuplicates: true });
  // Before the 0038 migration the place/cost columns don't exist — keep
  // sourcing working by retrying without them.
  if (error && /place|cost/.test(error.message)) {
    await admin.from("sourced_events").upsert(
      rows.map(({ place: _p, cost: _c, ...rest }) => rest),
      { onConflict: "dedup_key", ignoreDuplicates: true },
    );
    return;
  }
  // Events already in the pool (sourced before place/cost existed) keep their
  // row on conflict — backfill just those two fields when we now know them.
  await Promise.all(
    rows
      .filter((r) => r.place || r.cost)
      .map((r) =>
        admin
          .from("sourced_events")
          .update({ place: r.place, cost: r.cost })
          .eq("dedup_key", r.dedup_key)
          .is("place", null)
          .is("cost", null),
      ),
  );
}

/**
 * Draw up to `limit` future pool events for the given locations, excluding any
 * dedup_key OR month-scoped topic_key the caller already holds — the latter
 * drops a same-event dupe that a different outlet worded differently. Soonest-
 * ending first.
 */
/** Normalize a 1-3 word topic label to a family key: "Meteor Showers" -> "meteor shower". */
export function topicFamily(topic: string | null | undefined): string | null {
  if (!topic) return null;
  const words = topic
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  return words.length ? words.join(" ") : null;
}

export async function drawFromPool(
  admin: SupabaseClient,
  locations: string[],
  excludeKeys: Set<string>,
  startISO: string,
  limit: number,
  excludeTopics: Set<string> = new Set(),
  /**
   * Topic FAMILIES (normalized 1-3 word `topic` labels, e.g. "meteor shower")
   * already on the deck. At most ONE card per family is drawn, and each pick is
   * ADDED to this set — so pass the same Set across calls to keep the whole deck
   * diverse (never four meteor-shower stories from four outlets).
   */
  excludeFamilies: Set<string> = new Set(),
): Promise<PoolEvent[]> {
  const locs = [...new Set(locations.map(normalizeLocation).filter(Boolean))];
  if (!locs.length || limit <= 0) return [];
  const { data } = await admin
    .from("sourced_events")
    .select("*")
    .in("location", locs)
    .gt("prune_at", startISO)
    .order("prune_at", { ascending: true })
    // Over-fetch: the family cap skips same-kind rows, so read deeper.
    .limit(Math.max(60, (limit + excludeKeys.size + excludeTopics.size) * 4));
  const rows = (data ?? []) as PoolEvent[];
  const out: PoolEvent[] = [];
  for (const r of rows) {
    if (excludeKeys.has(r.dedup_key)) continue;
    if (r.topic_key && excludeTopics.has(r.topic_key)) continue;
    const fam = topicFamily(r.topic);
    if (fam && excludeFamilies.has(fam)) continue;
    if (fam) excludeFamilies.add(fam);
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
