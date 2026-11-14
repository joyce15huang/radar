import { createAdminClient } from "@/lib/supabase/admin";
import { similarity } from "./guard";
import type { ParsedEvent } from "./schedule";

/** Model calls per user per rolling hour. */
export const PARSES_PER_HOUR = 30;
/** Window for reusing an identical result and for spotting repeat floods. */
const REPEAT_WINDOW_MS = 10 * 60_000;
/** Near-identical submissions allowed in that window before we bounce. */
const NEAR_REPEATS_ALLOWED = 2;
const NEAR = 0.8;

export const RATE_LIMITED_MESSAGE = "You've added a lot of plans this hour — give it a few minutes and try again.";
export const REPEAT_MESSAGE = "Looks like you're sending the same thing — try something new or wait a few minutes.";

/** Scout runs a user can trigger by hand (find more, saving cities) per hour and per day. */
export const SCOUTS_PER_HOUR = 6;
export const SCOUTS_PER_DAY = 20;
export const SCOUT_LIMITED_MESSAGE = "You've refreshed a lot — the scout will have more for you later today.";
const SCOUT_NORM = "scout:run";

/**
 * Take one of the caller's scout runs. False when they're over the limit. The
 * run is logged before it happens so parallel taps can't all slip through.
 * Shares the parse_usage table; before migration 0042 everything is allowed.
 */
export async function takeScoutRun(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("parse_usage")
    .select("created_at")
    .eq("user_id", userId)
    .eq("norm", SCOUT_NORM)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
    .limit(SCOUTS_PER_DAY + 5);
  if (error) return true;
  const rows = (data ?? []) as { created_at: string }[];
  const lastHour = rows.filter((r) => Date.now() - Date.parse(r.created_at) < 3_600_000).length;
  if (rows.length >= SCOUTS_PER_DAY || lastHour >= SCOUTS_PER_HOUR) return false;
  await admin.from("parse_usage").insert({ user_id: userId, norm: SCOUT_NORM, result: null });
  return true;
}

export type UsageCheck =
  | { kind: "ok" }
  | { kind: "cached"; events: ParsedEvent[] }
  | { kind: "limited" }
  | { kind: "repeat" };

interface Row {
  norm: string;
  result: { events?: ParsedEvent[] } | null;
  created_at: string;
}

/**
 * Before a model call: reuse an identical recent result (free), or bounce when
 * the user is over the hourly limit or keeps sending near-identical text.
 * Before migration 0042 runs (no table) everything is allowed.
 */
export async function checkParseUsage(userId: string, norm: string): Promise<UsageCheck> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { data, error } = await admin
    .from("parse_usage")
    .select("norm, result, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { kind: "ok" };
  const rows = ((data ?? []) as Row[]).filter((r) => r.norm !== SCOUT_NORM);
  const recent = rows.filter((r) => Date.now() - Date.parse(r.created_at) < REPEAT_WINDOW_MS);

  const same = recent.find((r) => r.norm === norm && r.result?.events?.length);
  if (same?.result?.events) return { kind: "cached", events: same.result.events };

  if (rows.length >= PARSES_PER_HOUR) return { kind: "limited" };

  const near = recent.filter((r) => similarity(r.norm, norm) >= NEAR).length;
  if (near >= NEAR_REPEATS_ALLOWED) return { kind: "repeat" };
  return { kind: "ok" };
}

/** After a model call: log it (with its result for reuse) and clear day-old rows. */
export async function recordParseUsage(userId: string, norm: string, events: ParsedEvent[] | null): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("parse_usage").insert({ user_id: userId, norm, result: events ? { events } : null });
  if (error) return;
  await admin
    .from("parse_usage")
    .delete()
    .eq("user_id", userId)
    .lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
}
