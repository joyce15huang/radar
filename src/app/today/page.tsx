import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { TabNav } from "@/components/TabNav";
import { ForYouList } from "@/components/ForYouList";
import { PostCard } from "@/components/explore/PostCard";
import { ScoutList } from "@/components/explore/ScoutList";
import { ScoutNow } from "@/components/explore/ScoutNow";
import { rowToCard, CARD_SELECT, type CardRow } from "@/lib/cardMapping";
import { startOfTodayISO } from "@/lib/time";
import { isPastCard } from "@/lib/calendarSort";
import { getActor } from "@/lib/actor";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendIdSet, isStrangerInvite } from "@/lib/friendIds";
import { headcountsForEvents } from "@/app/team-actions";
import { listExplore } from "@/app/date-post-actions";
import { CATEGORIES, CATEGORY_LABEL, SCOPES, type Scope } from "@/lib/explore";
import { serverTimeZone } from "@/lib/tz";
import type { DigestCardData } from "@/lib/types";

type Params = { scope?: string; free?: string; cat?: string; friends?: string; q?: string };
const TEAM_TODAY_WINDOW_MS = 7 * 86_400_000;
const SCOUT_TYPES = new Set(["news_scout", "time_window"]);

/**
 * Today = two zones. "For you" is short and finite: what came TO you and needs
 * an answer or a glance. "Explore" below is everything you could go and find —
 * posts that carry dates — scoped to a window of time so it always has an end.
 * Nothing in Explore notifies.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { supabase, actorId } = actor;
  const tz = await serverTimeZone();

  const scope: Scope = sp.scope === "week" || sp.scope === "month" ? sp.scope : "weekend";
  const free = sp.free !== "0";
  const cat = (CATEGORIES as readonly string[]).includes(sp.cat ?? "") ? sp.cat : undefined;
  const friendsOnly = sp.friends === "1";
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const href = (patch: Partial<Record<keyof Params, string | undefined>>) => {
    const next = { scope: scope === "weekend" ? undefined : scope, free: free ? undefined : "0", cat, friends: friendsOnly ? "1" : undefined, q, ...patch };
    const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1])).toString();
    return qs ? `/today?${qs}#explore` : "/today#explore";
  };

  const [{ data: rows, error: cardsError }, friends, explore] = await Promise.all([
    supabase
      .from("cards")
      .select(CARD_SELECT)
      .eq("user_id", actorId)
      .eq("status", "pending")
      .or(`prune_at.is.null,prune_at.gt.${startOfTodayISO()}`)
      .order("created_at", { ascending: true }),
    friendIdSet(createAdminClient(), actorId),
    listExplore({ scope, free, category: cat, friendsOnly, q }),
  ]);

  const nowMs = Date.now();
  const mapped = (rows ?? [])
    .filter((r) => {
      const row = r as CardRow;
      const c = (row.content ?? {}) as Record<string, unknown>;
      // Strangers' invites wait under Chats → Requests.
      if (isStrangerInvite(row, actorId, friends)) return false;
      // Waitlisted / answered "Maybe": already on the Calendar.
      if (c.waitlistedAt || c.maybe === "true") return false;
      // A whole season arrives at once — only this week's team events come here.
      if (row.type === "social_invite" && c.teamId && typeof c.startsAt === "string") {
        const t = Date.parse(c.startsAt);
        if (!Number.isNaN(t) && t - nowMs > TEAM_TODAY_WINDOW_MS) return false;
      }
      return true;
    })
    .map((r) => rowToCard(r as CardRow))
    .filter((c): c is DigestCardData => c !== null)
    .filter((c) => !isPastCard(c, nowMs, tz));

  // Team games show their live headcount ("6 of 8 in").
  const teamEventIds = mapped.flatMap((c) => (c.type === "social_invite" && c.teamId && c.eventId ? [c.eventId] : []));
  if (teamEventIds.length) {
    const counts = await headcountsForEvents([...new Set(teamEventIds)]);
    for (const c of mapped) {
      if (c.type !== "social_invite" || !c.eventId || !counts[c.eventId]) continue;
      c.teamIn = counts[c.eventId].in;
      c.teamMin = counts[c.eventId].min;
      if (counts[c.eventId].teamName) c.teamName = counts[c.eventId].teamName;
    }
  }

  const rank = (t: string) => (t === "event_update" ? 0 : t === "social_invite" ? 1 : 2);
  const forYou = mapped.filter((c) => !SCOUT_TYPES.has(c.type)).sort((a, b) => rank(a.type) - rank(b.type));
  const filtered = !!(cat || friendsOnly || q);
  const scout = filtered ? [] : mapped.filter((c) => SCOUT_TYPES.has(c.type)).slice(0, 6);

  const dateLabel = new Date().toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" });
  const scopeLabel = SCOPES.find((s) => s.key === scope)!.label.toLowerCase();
  const nextScope = scope === "weekend" ? SCOPES[1] : scope === "week" ? SCOPES[2] : null;
  const chip = (on: boolean) =>
    `inline-flex h-[34px] shrink-0 items-center rounded-full px-3 text-[13px] font-semibold ${
      on ? "bg-neutral-900 text-white" : "border border-neutral-200 bg-white text-neutral-900"
    }`;

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-10">
        <TabNav />
        <header className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-neutral-500">{dateLabel}</p>
            <h1 className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900">Today</h1>
          </div>
          <Link
            href="/post/new"
            aria-label="New post"
            className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-fuchsia-700 text-white shadow-[0_8px_20px_rgba(181,82,74,0.25)]"
          >
            <Plus className="h-5 w-5" strokeWidth={2.6} />
          </Link>
        </header>

        {cardsError ? (
          <SchemaNotice message={cardsError.message} />
        ) : (
          <section className="space-y-2.5">
            <h2 className="text-[13px] font-bold text-neutral-500">For you{forYou.length ? ` · ${forYou.length}` : ""}</h2>
            <ForYouList cards={forYou} tz={tz} />
          </section>
        )}

        <section id="explore" className="mt-7 scroll-mt-4 space-y-3 border-t border-neutral-200 pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[20px] font-bold tracking-tight text-neutral-900">Explore</h2>
            <span className="text-[13px] font-semibold text-neutral-500">
              {explore.posts.length} {explore.posts.length === 1 ? "thing" : "things"} {scopeLabel}
            </span>
          </div>

          <form action="/today" className="flex h-11 items-center gap-2 rounded-full bg-neutral-200/70 pl-3.5 pr-1.5">
            <Search className="h-4 w-4 shrink-0 text-neutral-600" />
            <input
              name="q"
              defaultValue={q ?? ""}
              aria-label="Search posts"
              placeholder="Search posts, places, dates"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-neutral-900 outline-none placeholder:text-neutral-500"
            />
            {scope !== "weekend" && <input type="hidden" name="scope" value={scope} />}
            {!free && <input type="hidden" name="free" value="0" />}
            {cat && <input type="hidden" name="cat" value={cat} />}
            {friendsOnly && <input type="hidden" name="friends" value="1" />}
            {q && (
              <Link href={href({ q: undefined })} className="flex h-8 items-center rounded-full px-2.5 text-[12px] font-semibold text-neutral-600">
                Clear
              </Link>
            )}
          </form>

          <div role="group" aria-label="When" className="grid grid-cols-3 gap-1 rounded-[14px] bg-neutral-200/70 p-1">
            {SCOPES.map((s) => (
              <Link
                key={s.key}
                href={href({ scope: s.key === "weekend" ? undefined : s.key })}
                aria-current={scope === s.key ? "true" : undefined}
                className={`flex h-[38px] items-center justify-center rounded-[10px] text-[13px] ${
                  scope === s.key ? "bg-white font-bold text-neutral-900 shadow-sm" : "font-semibold text-neutral-600"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <Link href={href({ free: free ? "0" : undefined })} aria-current={free ? "true" : undefined} className={chip(free)}>
              When I&rsquo;m free
            </Link>
            <Link href={href({ friends: friendsOnly ? undefined : "1" })} aria-current={friendsOnly ? "true" : undefined} className={chip(friendsOnly)}>
              Friends
            </Link>
            {CATEGORIES.filter((c) => c !== "other").map((c) => (
              <Link key={c} href={href({ cat: cat === c ? undefined : c })} aria-current={cat === c ? "true" : undefined} className={chip(cat === c)}>
                {CATEGORY_LABEL[c]}
              </Link>
            ))}
          </div>

          {explore.posts.map((p) => (
            <PostCard key={p.id} post={p} tz={tz} />
          ))}
          <ScoutList cards={scout} />

          {explore.posts.length === 0 && scout.length === 0 ? (
            <div className="space-y-3 rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center">
              <p className="text-[15px] font-semibold text-neutral-900">
                Nothing {free ? "that fits your free time " : ""}
                {scopeLabel} yet
              </p>
              <p className="text-[13px] text-neutral-500">
                Posts from friends and public accounts show up here. Know of something? Post it — it only needs a date.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {free && (
                  <Link href={href({ free: "0" })} className="inline-flex h-11 items-center rounded-xl bg-neutral-900 px-4 text-[14px] font-semibold text-white">
                    Show everything
                  </Link>
                )}
                {!filtered && <ScoutNow />}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 pt-2">
              <p className="text-[13px] font-semibold text-neutral-500">That&rsquo;s everything {scopeLabel}.</p>
              {nextScope && (
                <Link href={href({ scope: nextScope.key })} className="text-[14px] font-bold text-fuchsia-800">
                  Look at {nextScope.label.toLowerCase()}
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/** Rendered when the cards query fails — almost always a missing migration. */
function SchemaNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium text-amber-800">
        <AlertTriangle className="h-4 w-4" />
        Couldn&rsquo;t load your cards
      </div>
      <p className="text-amber-700/90">{message}</p>
      <p className="mt-2 text-amber-700/90">Run the latest migrations in the Supabase SQL Editor, then reload.</p>
    </div>
  );
}
