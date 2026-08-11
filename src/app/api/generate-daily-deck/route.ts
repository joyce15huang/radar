import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillUserDeck, type FillResult } from "@/lib/scout/persistDeck";
import { generateDeck } from "@/lib/scout/generateDeck";
import { upsertPoolEvents, wasSourcedToday, markSourced } from "@/lib/scout/pool";
import { startOfTodayISO } from "@/lib/time";

// Long-running batch. Node runtime (SDKs need it); allow up to 5 min on Vercel.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** A user's cities, or their standing prompt as a single fallback subject. */
function effectiveLocations(p: {
  locations?: string[] | null;
  standing_prompt?: string | null;
}): string[] {
  const locs = (p.locations ?? []).map((s) => s.trim()).filter(Boolean);
  if (locs.length) return locs;
  const sp = p.standing_prompt?.trim();
  return sp ? [sp] : [];
}

type UserReport = { user_id: string } & Partial<FillResult> & { error?: string };

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const onlyUser = url.searchParams.get("userId"); // optional: one user, for testing
  const weeklyParam = url.searchParams.get("weekly"); // "true" | "false" | null (auto = Mondays)

  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const startISO = startOfTodayISO();
  const nowMs = now.getTime();
  const isMonday = now.getUTCDay() === 1;
  const includeWeekly =
    weeklyParam === "true" ? true : weeklyParam === "false" ? false : isMonday;

  const admin = createAdminClient();

  let query = admin
    .from("preferences")
    .select("user_id, standing_prompt, weekly_prompt, locations");
  if (onlyUser) query = query.eq("user_id", onlyUser);
  const { data: prefs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // --- Phase 1: refresh the shared pool once per distinct city (cross-user reuse).
  const cities = [
    ...new Set((prefs ?? []).flatMap((p) => effectiveLocations(p))),
  ];
  const sourced: string[] = [];
  for (const city of cities) {
    if (await wasSourcedToday(admin, city, startISO)) continue;
    try {
      const daily = await generateDeck(city, todayISO, "daily");
      await upsertPoolEvents(admin, city, daily, nowMs);
      if (includeWeekly) {
        const weekly = await generateDeck(city, todayISO, "weekly");
        await upsertPoolEvents(admin, city, weekly, nowMs);
      }
      await markSourced(admin, city, now.toISOString());
      sourced.push(city);
    } catch {
      // Tolerate a city that fails to source; users still draw the existing pool.
    }
  }

  // --- Phase 2: fill each user's deck from the pool (gap-fill, dismissal-aware).
  const report: UserReport[] = [];
  for (const p of prefs ?? []) {
    try {
      const r = await fillUserDeck(admin, p.user_id, {
        locations: effectiveLocations(p),
        todayISO,
      });
      report.push({ user_id: p.user_id, ...r });
    } catch (e) {
      report.push({
        user_id: p.user_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    date: todayISO,
    includeWeekly,
    citiesSourced: sourced.length,
    users: report.length,
    report,
  });
}

export const GET = handle;
export const POST = handle;
