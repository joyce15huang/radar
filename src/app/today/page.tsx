import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { DigestFeed, DeckHeader } from "@/components/DigestFeed";
import { TabNav } from "@/components/TabNav";
import { EmptyDeck } from "@/components/EmptyDeck";
import { rowToCard, CARD_SELECT, type CardRow } from "@/lib/cardMapping";
import { startOfTodayISO, APP_TZ } from "@/lib/time";
import { isPastCard } from "@/lib/calendarSort";
import { busyFromCard, type BusyInterval } from "@/lib/conflicts";
import { getActor } from "@/lib/actor";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendIdSet, isStrangerInvite } from "@/lib/friendIds";
import type { DigestCardData } from "@/lib/types";

// PIVOT PHASE 2: the feed reads the active persona's real `pending` cards.
export default async function TodayPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { supabase, actorId } = actor;

  // Never show a public event whose day has passed, even between nightly runs.
  // Friend/calendar cards have a null prune_at and always pass this filter.
  const startISO = startOfTodayISO();

  const [{ data: rows, error: cardsError }, { data: handledRows }, { data: prefs }, { data: acceptedRows }] =
    await Promise.all([
      supabase
        .from("cards")
        .select(CARD_SELECT)
        .eq("user_id", actorId)
        .eq("status", "pending")
        .or(`prune_at.is.null,prune_at.gt.${startISO}`)
        .order("created_at", { ascending: true }),
      // Cards that arrived today and were already handled — kept in the deck so
      // you can flip back to them instead of them vanishing.
      supabase
        .from("cards")
        .select(CARD_SELECT)
        .eq("user_id", actorId)
        .in("status", ["saved", "dismissed", "accepted"])
        .gte("created_at", startISO)
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
  // Only things that came TO you belong in the deck — not plans you made
  // yourself (quick-adds, events you host), which are also created "today".
  const handled = (handledRows ?? []).filter((r) => {
    const row = r as CardRow;
    if (row.sender_id === actorId) return false;
    const c = (row.content ?? {}) as Record<string, unknown>;
    if (row.type === "social_invite" && c.hostId === actorId) return false;
    // A personal entry only counts if it was a discovered card you added.
    if (row.type === "calendar_radar" && !c.sourceUrl) return false;
    return true;
  });
  // Invites from people you're not friends with wait in the Inbox instead.
  const friends = await friendIdSet(createAdminClient(), actorId);
  const pendingRows = (rows ?? []).filter((r) => !isStrangerInvite(r as CardRow, actorId, friends));
  const mapped = [...handled, ...pendingRows]
    .map((r) => rowToCard(r as CardRow))
    .filter((c): c is DigestCardData => c !== null)
    .filter((c) => !isPastCard(c, nowMs, APP_TZ));
  // Anti-flood: collapse multiple broadcasts from one source into one deck card.
  const cards = bundleBroadcasts(mapped);

  // Invites always come first; everything else (posts, news, pings, schedule)
  // stays mixed in its existing created_at order. Array.sort is stable, so the
  // rows (already ordered by created_at) keep their relative order within each group.
  const rank = (t: string) =>
    t === "event_update" ? 0 : t === "social_invite" || t === "broadcast_bundle" ? 1 : 2;
  cards.sort((a, b) => rank(a.type) - rank(b.type));

  const hasPrompt = Boolean(prefs?.standing_prompt?.trim() || prefs?.weekly_prompt?.trim());

  const dateLabel = new Date().toLocaleDateString("en-US", {
    timeZone: APP_TZ,
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
        <TabNav />

        {cardsError ? (
          <SchemaNotice message={cardsError.message} />
        ) : cards.length === 0 ? (
          <>
            <DeckHeader dateLabel={dateLabel} done={0} total={0} />
            <EmptyDeck hasPrompt={hasPrompt} />
          </>
        ) : (
          <DigestFeed initialCards={cards} dateLabel={dateLabel} busy={busy} persist />
        )}
      </div>
    </main>
  );
}

/**
 * Collapse ≥2 pending follower-broadcast invites from the SAME source into one
 * synthetic "broadcast_bundle" card, so a public poster can't flood the deck.
 * A source with a single broadcast keeps its normal invite card.
 */
function bundleBroadcasts(cards: DigestCardData[]): DigestCardData[] {
  const bySender = new Map<string, DigestCardData[]>();
  const rest: DigestCardData[] = [];
  for (const c of cards) {
    if (c.type === "social_invite" && c.broadcast && c.senderId && c.status === "pending") {
      const arr = bySender.get(c.senderId) ?? [];
      arr.push(c);
      bySender.set(c.senderId, arr);
    } else {
      rest.push(c);
    }
  }
  const out = [...rest];
  for (const [senderId, group] of bySender) {
    if (group.length < 2) {
      out.push(...group);
      continue;
    }
    const inv = group as Extract<DigestCardData, { type: "social_invite" }>[];
    out.push({
      type: "broadcast_bundle",
      id: `bundle:${senderId}`,
      status: "pending",
      createdAt: inv.reduce((m, c) => (c.createdAt > m ? c.createdAt : m), inv[0].createdAt),
      senderId,
      senderName: inv[0].senderName,
      count: inv.length,
      titles: inv.map((c) => c.eventTitle),
      cardIds: inv.map((c) => c.id),
    });
  }
  return out;
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
