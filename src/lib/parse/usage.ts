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
  const rows = (data ?? []) as Row[];
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
