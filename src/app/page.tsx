import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { DigestFeed } from "@/components/DigestFeed";
import { AccountBar } from "@/components/AccountBar";
import { TabNav } from "@/components/TabNav";
import { EmptyDeck } from "@/components/EmptyDeck";
import { rowToCard, CARD_SELECT, type CardRow } from "@/lib/cardMapping";
import { startOfTodayISO, APP_TZ } from "@/lib/time";
import { isPastCard } from "@/lib/calendarSort";
import { busyFromCard, type BusyInterval } from "@/lib/conflicts";
import { getActor } from "@/lib/actor";
import type { DigestCardData } from "@/lib/types";

// PIVOT PHASE 2: the feed reads the active persona's real `pending` cards.
export default async function Home() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { supabase, actorId } = actor;

  // Never show a public event whose day has passed, even between nightly runs.
  // Friend/calendar cards have a null prune_at and always pass this filter.
  const startISO = startOfTodayISO();

  const [{ data: rows, error: cardsError }, { data: prefs }, { data: acceptedRows }] =
    await Promise.all([
      supabase
        .from("cards")
        .select(CARD_SELECT)
        .eq("user_id", actorId)
        .eq("status", "pending")
        .or(`prune_at.is.null,prune_at.gt.${startISO}`)
        .order("created_at", { ascending: true }),
      supabase
        .from("preferences")
        .select("standing_prompt, weekly_prompt")
        .eq("user_id", actorId)
        .maybeSingle(),
      // The already-accepted calendar — used to flag conflicts on today's cards.
      supabase
        .from("cards")
        .select(CARD_SELECT)
        .eq("user_id", actorId)
        .eq("status", "accepted")
        .in("type", ["social_invite", "calendar_radar", "time_window"]),
    ]);

  // Busy blocks from the accepted calendar (only those with a concrete time).
  const busy: BusyInterval[] = (acceptedRows ?? [])
    .map((r) => rowToCard(r as CardRow))
    .filter((c): c is DigestCardData => c !== null)
    .map((c) => busyFromCard(c))
    .filter((b): b is BusyInterval => b !== null);

  // The DB query drops past *scout* cards by prune_at, but event cards
  // (invites/schedule/time windows) carry a null prune_at and always pass that
  // filter. Hide any card whose anchored day has already passed in the app
  // timezone, so yesterday's events fall off the feed the moment the date rolls
  // over — no nightly job required.
  const nowMs = Date.now();
  const cards = (rows ?? [])
    .map((r) => rowToCard(r as CardRow))
    .filter((c): c is DigestCardData => c !== null)
    .filter((c) => !isPastCard(c, nowMs, APP_TZ));

  // Invites always come first; everything else (posts, news, pings, schedule)
  // stays mixed in its existing created_at order. Array.sort is stable, so the
  // rows (already ordered by created_at) keep their relative order within each group.
  const rank = (t: string) => (t === "event_update" ? 0 : t === "social_invite" ? 1 : 2);
  cards.sort((a, b) => rank(a.type) - rank(b.type));

  const hasPrompt = Boolean(prefs?.standing_prompt?.trim() || prefs?.weekly_prompt?.trim());

  const now = new Date();
  const dateLabel = `${now.toLocaleDateString("en-US", { weekday: "long" })} Briefing`;
  const dateSub = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <AccountBar email={actor.userEmail ?? undefined} link={{ href: "/profile", label: "Settings" }} />
        <TabNav />

        {cardsError ? (
          <SchemaNotice message={cardsError.message} />
        ) : cards.length === 0 ? (
          <EmptyDeck hasPrompt={hasPrompt} />
        ) : (
          <DigestFeed initialCards={cards} dateLabel={dateLabel} dateSub={dateSub} busy={busy} persist />
        )}
      </div>
    </main>
  );
}

/** Rendered when the cards query fails — almost always a missing migration. */
function SchemaNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm dark:border-amber-500/20 dark:bg-amber-500/10">
      <div className="mb-2 flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4" />
        Couldn&rsquo;t load your cards
      </div>
      <p className="text-amber-700/90 dark:text-amber-400/90">{message}</p>
      <p className="mt-2 text-amber-700/90 dark:text-amber-400/90">
        If this mentions a missing column (like <code>prune_at</code> or <code>content</code>), run
        the latest migrations in the Supabase SQL Editor, then reload.
      </p>
    </div>
  );
}
