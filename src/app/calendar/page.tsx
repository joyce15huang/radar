import { redirect } from "next/navigation";
import { serverTimeZone } from "@/lib/tz";
import { TabNav } from "@/components/TabNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { CalendarView } from "@/components/CalendarView";
import { EventFormFab } from "@/components/EventFormFab";
import { rowToCard, CARD_SELECT, type CardRow } from "@/lib/cardMapping";
import { startKey, isPastCard } from "@/lib/calendarSort";
import { getActor } from "@/lib/actor";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendIdSet, isStrangerInvite } from "@/lib/friendIds";
import type { DigestCardData } from "@/lib/types";
import { cleanItinerary, addDays, type Trip } from "@/lib/itinerary";
import { dayInTz } from "@/lib/calendarSort";

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
  // Invites from people you're not friends with wait in the Inbox instead.
  const friends = await friendIdSet(createAdminClient(), actorId);
  const all = (rows ?? [])
    .filter((r) => !isStrangerInvite(r as CardRow, actorId, friends))
    .map((r) => rowToCard(r as CardRow))
    .filter((c): c is DigestCardData => c !== null)
    .filter(
      (c) =>
        c.status === "accepted" ||
        // Personal invites only — public follower broadcasts stay in Today.
        (c.type === "social_invite" && (!c.broadcast || !!c.waitlisted) && !isPastCard(c, now, tz)),
    );

  // Itinerary plans: their days, so the calendar can show Day 2, Day 3 …
  // (No itinerary column before migration 0047: then there are no trips.)
  const trips: Record<string, Trip> = {};
  const eventIds = [...new Set(all.map((c) => (c.type === "social_invite" ? c.eventId : undefined)).filter(Boolean))] as string[];
  if (eventIds.length) {
    const { data: evs } = await createAdminClient()
      .from("events")
      .select("id, title, starts_at, itinerary")
      .in("id", eventIds)
      .not("itinerary", "is", null);
    for (const e of (evs ?? []) as { id: string; title: string | null; starts_at: string | null; itinerary: unknown }[]) {
      const days = cleanItinerary(e.itinerary);
      const start = e.starts_at ? dayInTz(e.starts_at, tz) : null;
      if (days.length && start) trips[e.id] = { eventId: e.id, title: e.title ?? "Trip", start, days };
    }
  }
  const today = dayInTz(now, tz) ?? "";
  const tripOf = (c: DigestCardData) => (c.type === "social_invite" && c.eventId ? trips[c.eventId] : undefined);
  const isPast = (c: DigestCardData) => {
    const t = tripOf(c);
    return t ? addDays(t.start, t.days.length - 1) < today : isPastCard(c, now, tz);
  };

  const byCreated = (a: DigestCardData, b: DigestCardData) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt);

  // Upcoming: soonest first, undated last. Past (auto-archived): most recent first.
  const upcoming = all
    .filter((c) => !isPast(c))
    .sort((a, b) => startKey(a) - startKey(b) || byCreated(a, b));

  const past = all
    .filter((c) => isPast(c))
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
        <CalendarView upcoming={upcoming} past={past} tz={tz} viewerId={actorId} trips={trips} />
      </div>
      <EventFormFab />
    </main>
  );
}
