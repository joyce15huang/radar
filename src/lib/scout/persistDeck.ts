import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDeck } from "./generateDeck";
import { drawFromPool, upsertPoolEvents, type PoolEvent } from "./pool";
import { SCOUT_CATEGORY_KEYS, type GeneratedCard } from "./anthropic";
import { startOfTodayISO } from "@/lib/time";
import type { CategoryKey } from "@/lib/types";

/** The scout's own card types — the only ones the fill engine ever prunes or
 *  inserts. Friend/calendar cards are never counted toward the cap or touched. */
const PUBLIC_TYPES = ["news_scout", "time_window"];

/** How many public-sourced cards the daily deck tops up to. */
export const DECK_CAP = 5;

const ALLOWED_CATEGORIES = new Set<string>(SCOUT_CATEGORY_KEYS);
function safeCategory(value: string | null | undefined): CategoryKey {
  return value && ALLOWED_CATEGORIES.has(value) ? (value as CategoryKey) : "local";
}

export interface FillResult {
  /** New cards inserted this run. */
  filled: number;
  /** Surviving (non-dismissed, not-yet-past) public cards already in the deck. */
  kept: number;
  /** Past cards removed this run. */
  pruned: number;
  cap: number;
  error?: string;
}

export interface FillOpts {
  /** The user's cities (or a derived subject) — where to source/draw from. */
  locations: string[];
  todayISO: string;
  cap?: number;
  /** "Spawn more": add exactly this many beyond whatever is already there. */
  extra?: number;
  /**
   * Explicit user-triggered refresh ("Save & refresh my deck"). Replaces the
   * pending public cards with a fresh set for the CURRENT locations, instead of
   * only topping up to the cap. Safe: if the fresh set comes back empty (no pool
   * hit and live sourcing failed), the existing deck is left untouched.
   */
  refresh?: boolean;
}

/** Build a `cards` insert row from a pool event. Timing lives both in columns
 *  (prune_at for pruning) and in content (opensAt/expiresAt for the UI). */
function poolEventToCardRow(userId: string, e: PoolEvent) {
  const isWindow = e.kind === "time_window";
  return {
    user_id: userId,
    sender_id: null,
    type: isWindow ? "time_window" : "news_scout",
    title: e.title,
    starts_at: e.starts_at,
    prune_at: e.prune_at,
    dedup_key: e.dedup_key,
    content: {
      category: safeCategory(e.category),
      summary: e.summary,
      topic: e.topic,
      actionLabel: e.action_label,
      actionUrl: e.action_url,
      ...(isWindow
        ? { expiresAt: e.expires_at, opensAt: e.opens_at, windowLabel: e.window_label }
        : {}),
    },
    status: "pending",
  };
}

/**
 * Refresh ONE user's deck by the Opportunity Engine's rules:
 *   1. Prune pending public cards whose event has passed (frees slots).
 *   2. Count survivors; a kept (non-dismissed) card simply stays.
 *   3. need = cap - survivors  (or `extra` for an explicit "spawn more").
 *   4. Fill `need` from the shared pool first (no external calls); if the pool
 *      is short, source live per location, enrich the pool, and draw again.
 * A card is never re-shown if the user already holds its dedup_key in ANY status,
 * so a dismissed card can never come back and nothing duplicates.
 *
 * Pass a service-role client (admin) so the delete/insert bypass RLS.
 */
export async function fillUserDeck(
  admin: SupabaseClient,
  userId: string,
  opts: FillOpts,
): Promise<FillResult> {
  const cap = opts.cap ?? DECK_CAP;
  const startISO = startOfTodayISO();
  const nowMs = Date.now();
  const locations = [
    ...new Set((opts.locations ?? []).map((s) => s.trim()).filter(Boolean)),
  ];

  // Explicit "refresh": rebuild the public deck for the current locations rather
  // than merely topping up. Kept out of the gap-fill path below on purpose.
  if (opts.refresh) {
    return refreshPublicDeck(admin, userId, locations, opts.todayISO, cap, startISO, nowMs);
  }

  // 1. Prune past pending public cards. Nulls (legacy / friend cards) untouched.
  const { data: prunedRows, error: pruneErr } = await admin
    .from("cards")
    .delete()
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("type", PUBLIC_TYPES)
    .lte("prune_at", startISO)
    .select("id");
  if (pruneErr) return { filled: 0, kept: 0, pruned: 0, cap, error: pruneErr.message };
  const pruned = prunedRows?.length ?? 0;

  // 2. Count survivors + gather every dedup_key this user has EVER held.
  const [{ data: survivors }, { data: held }] = await Promise.all([
    admin
      .from("cards")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .in("type", PUBLIC_TYPES),
    admin.from("cards").select("dedup_key").eq("user_id", userId).not("dedup_key", "is", null),
  ]);
  const kept = survivors?.length ?? 0;
  const heldKeys = new Set<string>(
    (held ?? [])
      .map((r) => (r as { dedup_key: string | null }).dedup_key)
      .filter((k): k is string => Boolean(k)),
  );

  const need = opts.extra && opts.extra > 0 ? opts.extra : Math.max(0, cap - kept);
  if (need === 0 || locations.length === 0) return { filled: 0, kept, pruned, cap };

  // 3. Fill from the shared pool first (cheap DB read, no external calls).
  const picked: PoolEvent[] = [];
  for (const e of await drawFromPool(admin, locations, heldKeys, startISO, need)) {
    picked.push(e);
    heldKeys.add(e.dedup_key);
  }

  // 4. Live fallback, per location, only for the residual gap — and the fresh
  //    results enrich the pool for the next user who needs this city.
  for (const loc of locations) {
    if (picked.length >= need) break;
    let gen: GeneratedCard[] = [];
    try {
      gen = await generateDeck(loc, opts.todayISO, "daily");
    } catch {
      continue;
    }
    await upsertPoolEvents(admin, loc, gen, nowMs);
    for (const e of await drawFromPool(admin, [loc], heldKeys, startISO, need - picked.length)) {
      picked.push(e);
      heldKeys.add(e.dedup_key);
    }
  }

  if (picked.length === 0) return { filled: 0, kept, pruned, cap };

  const rows = picked.slice(0, need).map((e) => poolEventToCardRow(userId, e));
  const { error } = await admin.from("cards").insert(rows);
  if (error) return { filled: 0, kept, pruned, cap, error: error.message };
  return { filled: rows.length, kept, pruned, cap };
}

/**
 * Rebuild the public portion of the deck for the CURRENT locations. Used when the
 * user explicitly saves preferences ("Save & refresh my deck") — otherwise a full
 * deck means `need === 0` and the change appears to do nothing, which is exactly
 * the "refresh doesn't work" symptom.
 *
 * Order matters for safety: we build the fresh set in memory FIRST, and only
 * delete the old pending public cards once we actually have replacements. If the
 * pool is empty and live sourcing fails (e.g. no API key), the old deck is left
 * intact rather than wiped to nothing.
 *
 * Dismissed/saved/accepted cards (and all friend/calendar cards) are never
 * touched, and their dedup_keys still suppress re-showing — only the pending
 * public cards are swapped.
 */
async function refreshPublicDeck(
  admin: SupabaseClient,
  userId: string,
  locations: string[],
  todayISO: string,
  cap: number,
  startISO: string,
  nowMs: number,
): Promise<FillResult> {
  // What's on the deck right now (kept if we can't produce a fresh set).
  const { data: currentRows } = await admin
    .from("cards")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("type", PUBLIC_TYPES);
  const currentCount = currentRows?.length ?? 0;

  if (locations.length === 0) return { filled: 0, kept: currentCount, pruned: 0, cap };

  // Suppress everything the user has EVER held EXCEPT the pending public cards we
  // are about to replace — so dismissed items stay gone, but a newly-added city
  // can still surface its own cards.
  const { data: held } = await admin
    .from("cards")
    .select("dedup_key, status, type")
    .eq("user_id", userId)
    .not("dedup_key", "is", null);
  const suppress = new Set<string>();
  for (const r of held ?? []) {
    const row = r as { dedup_key: string | null; status: string; type: string };
    if (!row.dedup_key) continue;
    const isPendingPublic = row.status === "pending" && PUBLIC_TYPES.includes(row.type);
    if (!isPendingPublic) suppress.add(row.dedup_key);
  }

  // Build the fresh set: shared pool first, then live per location for the gap.
  const picked: PoolEvent[] = [];
  for (const e of await drawFromPool(admin, locations, suppress, startISO, cap)) {
    picked.push(e);
    suppress.add(e.dedup_key);
  }
  for (const loc of locations) {
    if (picked.length >= cap) break;
    let gen: GeneratedCard[] = [];
    try {
      gen = await generateDeck(loc, todayISO, "daily");
    } catch {
      continue;
    }
    await upsertPoolEvents(admin, loc, gen, nowMs);
    for (const e of await drawFromPool(admin, [loc], suppress, startISO, cap - picked.length)) {
      picked.push(e);
      suppress.add(e.dedup_key);
    }
  }

  // Nothing to show → don't wipe the existing deck.
  if (picked.length === 0) return { filled: 0, kept: currentCount, pruned: 0, cap };

  // Swap in the fresh set: drop old pending public cards, then insert.
  const { data: prunedRows, error: delErr } = await admin
    .from("cards")
    .delete()
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("type", PUBLIC_TYPES)
    .select("id");
  if (delErr) return { filled: 0, kept: currentCount, pruned: 0, cap, error: delErr.message };
  const pruned = prunedRows?.length ?? 0;

  const rows = picked.slice(0, cap).map((e) => poolEventToCardRow(userId, e));
  const { error } = await admin.from("cards").insert(rows);
  if (error) return { filled: 0, kept: 0, pruned, cap, error: error.message };
  return { filled: rows.length, kept: 0, pruned, cap };
}
