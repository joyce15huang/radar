"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  X,
  Check,
  Bookmark,
  ArrowUpRight,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DigestCardData } from "@/lib/types";
import type { BusyInterval } from "@/lib/conflicts";
import { DigestCard, addScoutWithBestGuess, scoutHasDate, type ResolveStatus } from "./DigestCard";
import { AllCaughtUp } from "./AllCaughtUp";
import { updateCardStatus } from "@/app/feed-actions";

interface DigestFeedProps {
  /** Today's cards: still-pending ones plus any already handled today. */
  initialCards: DigestCardData[];
  /** e.g. "Thursday, Oct 8" — computed on the server for a stable render. */
  dateLabel: string;
  /** When true, resolutions persist to Supabase (off for mock decks). */
  persist?: boolean;
  /** Accepted calendar blocks, for the per-card conflict check. */
  busy?: BusyInterval[];
}

type Dir = 1 | -1;
/** What happened to a card. "calendar" = a discovered event put on the calendar. */
type Outcome = ResolveStatus | "calendar";

type Primary =
  | { kind: "resolve"; status: ResolveStatus }
  | { kind: "calendar" }
  | { kind: "navigate"; href: string };

/** The main (right-hand) action for a card. */
function primaryAction(card: DigestCardData): Primary {
  switch (card.type) {
    case "social_invite":
    case "calendar_radar":
      return { kind: "resolve", status: "accepted" };
    case "event_update":
      return { kind: "resolve", status: "dismissed" };
    case "time_poll":
      return { kind: "navigate", href: `/poll/${card.pollId}` };
    case "broadcast_bundle":
      return { kind: "navigate", href: `/u/${card.senderId}` };
    case "time_window":
    case "news_scout":
      // Discovered events go straight onto the calendar (that's what "save" means
      // for a dated thing); undated news falls back to the Library.
      return scoutHasDate(card) ? { kind: "calendar" } : { kind: "resolve", status: "saved" };
    default:
      return { kind: "resolve", status: "saved" };
  }
}

function labels(card: DigestCardData): { skip: string; primary: string; icon: LucideIcon } {
  const p = primaryAction(card);
  switch (card.type) {
    case "social_invite":
      return { skip: "Can't go", primary: "Going", icon: Check };
    case "calendar_radar":
      return { skip: "Skip", primary: "Add", icon: CalendarPlus };
    case "event_update":
      return { skip: "Dismiss", primary: "Got it", icon: Check };
    case "time_poll":
      return { skip: "Skip", primary: "Respond", icon: ArrowUpRight };
    case "broadcast_bundle":
      return { skip: "Dismiss all", primary: "View all", icon: ArrowUpRight };
    default:
      return p.kind === "calendar"
        ? { skip: "Skip", primary: "Add to calendar", icon: CalendarPlus }
        : { skip: "Skip", primary: "Save", icon: Bookmark };
  }
}

/** Short past-tense label for a handled card. */
function outcomeLabel(card: DigestCardData, o: Outcome): string {
  if (o === "calendar") return "On your calendar";
  if (o === "accepted") return card.type === "social_invite" ? "You're going" : "On your calendar";
  if (o === "saved") return "Saved to Library";
  if (card.type === "event_update") return "Seen";
  if (card.type === "social_invite") return "Can't go";
  return "Skipped";
}

function initialOutcome(card: DigestCardData): Outcome | undefined {
  if (card.status === "pending") return undefined;
  // A discovered card added to the calendar comes back as a personal entry.
  if (card.status === "accepted" && card.type === "calendar_radar") return "calendar";
  return card.status as ResolveStatus;
}

/**
 * Today as a carousel: swipe (or ←/→) to flip between cards; Skip and the main
 * action are buttons. Handled cards stay in the deck with their outcome, so you
 * can always flip back — nothing disappears just because you passed it. The
 * last page is "All caught up".
 */
export function DigestFeed({ initialCards, dateLabel, persist = false, busy = [] }: DigestFeedProps) {
  const cards = initialCards;
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>(() => {
    const o: Record<string, Outcome> = {};
    for (const c of initialCards) {
      const v = initialOutcome(c);
      if (v) o[c.id] = v;
    }
    return o;
  });
  // Open on the first card you haven't handled yet.
  const [index, setIndex] = useState(() => {
    const i = initialCards.findIndex((c) => c.status === "pending");
    return i === -1 ? initialCards.length : i;
  });
  const [dir, setDir] = useState<Dir>(1);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = cards.length;
  const atEnd = index >= total;
  const card = atEnd ? undefined : cards[index];

  const go = (d: Dir) => {
    setError(null);
    setDir(d);
    setIndex((i) => Math.max(0, Math.min(total, i + d)));
  };
  const jump = (i: number) => {
    setError(null);
    setDir(i >= index ? 1 : -1);
    setIndex(i);
  };

  const persistStatus = (c: DigestCardData, status: ResolveStatus | "pending") => {
    if (!persist) return;
    const ids = c.type === "broadcast_bundle" ? c.cardIds : [c.id];
    for (const id of ids) void updateCardStatus(id, status);
  };

  const record = (c: DigestCardData, o: Outcome) => {
    setOutcomes((prev) => ({ ...prev, [c.id]: o }));
    // Move on after a beat so the stamp registers.
    window.setTimeout(() => go(1), 260);
  };

  const skip = () => {
    if (!card) return;
    persistStatus(card, "dismissed");
    record(card, "dismissed");
  };

  const primary = async () => {
    if (!card || working) return;
    const a = primaryAction(card);
    if (a.kind === "navigate") {
      window.location.assign(a.href);
      return;
    }
    if (a.kind === "calendar") {
      if (!persist) return record(card, "calendar");
      setWorking(true);
      setError(null);
      const r = await addScoutWithBestGuess(card);
      setWorking(false);
      if (!r.ok) {
        setError(r.error ?? "Couldn't add that to your calendar.");
        return;
      }
      return record(card, "calendar");
    }
    persistStatus(card, a.status);
    record(card, a.status);
  };

  /** Undo a status change (not a calendar add — remove those from Calendar). */
  const undo = () => {
    if (!card) return;
    persistStatus(card, "pending");
    setOutcomes((prev) => {
      const n = { ...prev };
      delete n[card.id];
      return n;
    });
  };

  /** In-card actions (e.g. the inline calendar picker) count as handling the card. */
  const onCardResolve = (id: string, status: ResolveStatus) => {
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    record(c, status === "accepted" && (c.type === "time_window" || c.type === "news_scout") ? "calendar" : status);
  };

  // Desktop: ← / → flip cards. A ref keeps the listener on the latest `go`.
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      goRef.current(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const values = Object.values(outcomes);
  const savedCount = values.filter((o) => o === "saved").length;
  const acceptedCount = values.filter((o) => o === "accepted" || o === "calendar").length;
  const openCount = cards.filter((c) => !outcomes[c.id]).length;
  const firstOpen = cards.findIndex((c) => !outcomes[c.id]);

  return (
    <div className="flex w-full flex-1 flex-col">
      <DeckHeader
        dateLabel={dateLabel}
        done={total - openCount}
        total={total}
        index={index}
        handled={cards.map((c) => !!outcomes[c.id])}
        onJump={jump}
      />

      {/* The card stretches to fill the screen; the buttons sit just above the tab bar. */}
      <div className="relative flex max-h-[760px] min-h-[420px] flex-1 flex-col">
        <AnimatePresence custom={dir} initial={false} mode="wait">
          {card ? (
            <SlideCard
              key={card.id}
              card={card}
              busy={busy}
              outcome={outcomes[card.id]}
              dir={dir}
              onFlip={go}
              onResolve={onCardResolve}
              canBack={index > 0}
            />
          ) : (
            <motion.div
              key="__end"
              custom={dir}
              variants={SLIDE}
              initial="enter"
              animate="center"
              exit="exit"
              drag="x"
              dragSnapToOrigin
              dragElastic={0.6}
              onDragEnd={(_, info) => {
                if (info.offset.x > 90 || info.velocity.x > 600) go(-1);
              }}
              className="touch-pan-y"
            >
              {openCount === 0 ? (
                <AllCaughtUp saved={savedCount} accepted={acceptedCount} />
              ) : (
                <div className="flex flex-col items-center rounded-[28px] bg-white px-6 py-12 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(46,33,29,0.08)]">
                  <p className="text-[20px] font-bold tracking-tight text-neutral-900">That&rsquo;s everything</p>
                  <p className="mt-1.5 max-w-xs text-[15px] text-neutral-600">
                    {openCount} card{openCount === 1 ? "" : "s"} still waiting on you — they&rsquo;ll be here tomorrow too.
                  </p>
                  <button
                    type="button"
                    onClick={() => firstOpen >= 0 && jump(firstOpen)}
                    className="mt-6 h-11 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white transition hover:bg-neutral-700"
                  >
                    Go to the first one
                  </button>
                </div>
              )}
              {total > 0 && (
                <button
                  type="button"
                  onClick={() => jump(0)}
                  className="mx-auto mt-4 flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
                >
                  <RotateCcw className="h-4 w-4" /> Flip through again
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop arrows beside the card */}
        <SideArrow side="left" disabled={index === 0} onClick={() => go(-1)} />
        <SideArrow side="right" disabled={atEnd} onClick={() => go(1)} />
      </div>

      {card && (
        <DeckControls
          card={card}
          outcome={outcomes[card.id]}
          working={working}
          error={error}
          onSkip={skip}
          onPrimary={primary}
          onUndo={undo}
          onNext={() => go(1)}
        />
      )}
    </div>
  );
}

/** Slide in from the side you're heading to; slide out the other way. */
const SLIDE: Variants = {
  enter: (d: Dir) => ({ x: d * 340, opacity: 0, rotate: d * 3 }),
  center: { x: 0, opacity: 1, rotate: 0, transition: { type: "spring", stiffness: 320, damping: 32 } },
  exit: (d: Dir) => ({ x: d * -340, opacity: 0, rotate: d * -3, transition: { duration: 0.14, ease: "easeIn" } }),
};

/** One card, draggable sideways to flip. Handled cards wear their outcome. */
function SlideCard({
  card,
  busy,
  outcome,
  dir,
  onFlip,
  onResolve,
  canBack,
}: {
  card: DigestCardData;
  busy: BusyInterval[];
  outcome?: Outcome;
  dir: Dir;
  onFlip: (d: Dir) => void;
  onResolve: (id: string, status: ResolveStatus) => void;
  canBack: boolean;
}) {
  const done = !!outcome;
  const positive = outcome === "accepted" || outcome === "saved" || outcome === "calendar";
  return (
    <motion.div
      custom={dir}
      variants={SLIDE}
      initial="enter"
      animate="center"
      exit="exit"
      drag="x"
      dragSnapToOrigin
      dragElastic={0.6}
      onDragEnd={(_, info) => {
        if (info.offset.x < -90 || info.velocity.x < -600) onFlip(1);
        else if ((info.offset.x > 90 || info.velocity.x > 600) && canBack) onFlip(-1);
      }}
      className="relative flex flex-1 cursor-grab touch-pan-y select-none flex-col active:cursor-grabbing"
    >
      {done && (
        <span
          className={`pointer-events-none absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold shadow-sm ${
            positive ? "bg-neutral-900 text-white" : "bg-white/95 text-neutral-700"
          }`}
        >
          {positive ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> : <X className="h-3.5 w-3.5" strokeWidth={2.6} />}
          {outcomeLabel(card, outcome!)}
        </span>
      )}
      <div className={`flex flex-1 flex-col ${done && !positive ? "opacity-60" : ""}`}>
        <DigestCard card={card} busy={busy} onResolve={onResolve} fill />
      </div>
    </motion.div>
  );
}

function SideArrow({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous card (←)" : "Next card (→)"}
      title={side === "left" ? "Previous (←)" : "Next (→)"}
      className={`absolute top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-30 md:flex ${
        side === "left" ? "-left-[72px]" : "-right-[72px]"
      }`}
    >
      <Icon className="h-6 w-6" strokeWidth={2.2} />
    </button>
  );
}

function DeckControls({
  card,
  outcome,
  working,
  error,
  onSkip,
  onPrimary,
  onUndo,
  onNext,
}: {
  card: DigestCardData;
  outcome?: Outcome;
  working: boolean;
  error: string | null;
  onSkip: () => void;
  onPrimary: () => void;
  onUndo: () => void;
  onNext: () => void;
}) {
  const l = labels(card);
  const Icon = l.icon;

  if (outcome) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2.5">
        <div className="flex items-center gap-2">
          {outcome !== "calendar" && (
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
            >
              <RotateCcw className="h-4 w-4" /> Undo
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white transition hover:bg-neutral-700"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <Hint />
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white text-[15px] font-semibold text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.98]"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2.4} />
          {l.skip}
        </button>
        <button
          type="button"
          onClick={onPrimary}
          disabled={working}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-fuchsia-700 text-[15px] font-semibold text-white shadow-[0_6px_16px_rgba(181,82,74,0.25)] transition hover:bg-fuchsia-800 active:scale-[0.98] disabled:opacity-70"
        >
          {working ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Icon className="h-[18px] w-[18px]" strokeWidth={2.4} />}
          {l.primary}
        </button>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <Hint />
    </div>
  );
}

function Hint() {
  return (
    <p className="text-xs text-neutral-500">
      <span className="md:hidden">Swipe to flip between cards</span>
      <span className="hidden md:inline">← → to flip between cards, or drag</span>
    </p>
  );
}

/** "Today" title, the date, "3 of 8", and a tappable progress strip. */
export function DeckHeader({
  dateLabel,
  done,
  total,
  index,
  handled,
  onJump,
}: {
  dateLabel: string;
  done: number;
  total: number;
  index?: number;
  handled?: boolean[];
  onJump?: (i: number) => void;
}) {
  const pos = index ?? done;
  return (
    <header className="mb-5 space-y-3.5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[13px] font-medium text-neutral-500">{dateLabel}</p>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900">Today</h1>
        </div>
        {total > 0 && (
          <span className="pb-1.5 text-[13px] font-semibold text-neutral-500">
            {pos >= total ? `${done} of ${total} done` : `${pos + 1} of ${total}`}
          </span>
        )}
      </div>
      {total > 0 && (
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => {
            const isDone = handled ? handled[i] : i < done;
            const tone = i === pos ? "bg-fuchsia-700" : isDone ? "bg-neutral-800" : "bg-neutral-200";
            return (
              <button
                key={i}
                type="button"
                onClick={() => onJump?.(i)}
                aria-label={`Card ${i + 1}`}
                className="group flex h-3 flex-1 items-center"
              >
                <span className={`h-1 w-full rounded-full transition-colors ${tone}`} />
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
