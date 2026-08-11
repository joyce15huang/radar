import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { serverTimeZone } from "@/lib/tz";
import { AccountBar } from "@/components/AccountBar";
import { TabNav } from "@/components/TabNav";
import { CalendarView } from "@/components/CalendarView";
import { rowToCard, CARD_SELECT, type CardRow } from "@/lib/cardMapping";
import { startKey, isPastCard } from "@/lib/calendarSort";
import type { DigestCardData } from "@/lib/types";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tz = await serverTimeZone();

  const { data: rows } = await supabase
    .from("cards")
    .select(CARD_SELECT)
    .eq("user_id", user.id)
    .eq("status", "accepted")
    .in("type", ["social_invite", "calendar_radar", "time_window"])
    .order("created_at", { ascending: true });

  const all = (rows ?? [])
    .map((r) => rowToCard(r as CardRow))
    .filter((c): c is DigestCardData => c !== null);

  const now = Date.now();
  const byCreated = (a: DigestCardData, b: DigestCardData) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt);

  // Upcoming: soonest first, undated last. Past (auto-archived): most recent first.
  const upcoming = all
    .filter((c) => !isPastCard(c, now, tz))
    .sort((a, b) => startKey(a) - startKey(b) || byCreated(a, b));

  const past = all
    .filter((c) => isPastCard(c, now, tz))
    .sort((a, b) => startKey(b) - startKey(a) || byCreated(b, a));

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <AccountBar email={user.email} link={{ href: "/profile", label: "Settings" }} />
        <TabNav />
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Calendar
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Events you&rsquo;re going to, schedule you&rsquo;ve added, and opportunity
            windows you&rsquo;re tracking &mdash; soonest first.
          </p>
        </header>
        <CalendarView upcoming={upcoming} past={past} tz={tz} viewerId={user.id} />
      </div>
    </main>
  );
}
