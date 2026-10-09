import { redirect } from "next/navigation";
import { serverTimeZone } from "@/lib/tz";
import { TabNav } from "@/components/TabNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { CalendarView } from "@/components/CalendarView";
import { EventFormFab } from "@/components/EventFormFab";
import { rowToCard, CARD_SELECT, type CardRow } from "@/lib/cardMapping";
import { startKey, isPastCard } from "@/lib/calendarSort";
import { getActor } from "@/lib/actor";
import type { DigestCardData } from "@/lib/types";

export default async function CalendarPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { supabase, actorId } = actor;

  const tz = await serverTimeZone();

  const { data: rows } = await supabase
    .from("cards")
    .select(CARD_SELECT)
    .eq("user_id", actorId)
    .in("status", ["accepted", "pending"])
    .in("type", ["social_invite", "calendar_radar", "time_window"])
    .order("created_at", { ascending: true });

  const now = Date.now();

  // Accepted items, plus invites friends sent you that you haven't answered yet
  // (shown tentatively with Accept / Decline). Unanswered invites to events that
  // already happened are left out.
  const all = (rows ?? [])
    .map((r) => rowToCard(r as CardRow))
    .filter((c): c is DigestCardData => c !== null)
    .filter(
      (c) =>
        c.status === "accepted" ||
        // Personal invites only — public follower broadcasts stay in Today.
        (c.type === "social_invite" && !c.broadcast && !isPastCard(c, now, tz)),
    );

  const byCreated = (a: DigestCardData, b: DigestCardData) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt);

  // Upcoming: soonest first, undated last. Past (auto-archived): most recent first.
  const upcoming = all
    .filter((c) => !isPastCard(c, now, tz))
    .sort((a, b) => startKey(a) - startKey(b) || byCreated(a, b));

  const past = all
    .filter((c) => isPastCard(c, now, tz))
    .sort((a, b) => startKey(b) - startKey(a) || byCreated(b, a));

  const monthLabel = new Date().toLocaleDateString("en-US", { timeZone: tz, month: "long", year: "numeric" });

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-44 pt-6 sm:px-6 sm:pt-10">
        <TabNav />
        <InstallPrompt />
        <header className="mb-4">
          <p className="text-[13px] font-medium text-neutral-500">{monthLabel}</p>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900">Calendar</h1>
        </header>
        <CalendarView upcoming={upcoming} past={past} tz={tz} viewerId={actorId} />
      </div>
      <EventFormFab />
    </main>
  );
}
