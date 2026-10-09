"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, type Variants } from "framer-motion";
import { X, Check, Bookmark, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DigestCardData } from "@/lib/types";
import type { BusyInterval } from "@/lib/conflicts";
import { DigestCard, type ResolveStatus } from "./DigestCard";
import { AllCaughtUp } from "./AllCaughtUp";
import { updateCardStatus } from "@/app/feed-actions";

interface DigestFeedProps {
  initialCards: DigestCardData[];
  /** e.g. "Thursday, Oct 8" — computed on the server for a stable render. */
  dateLabel: string;
  /** When true, resolutions persist to Supabase (off for mock decks). */
  persist?: boolean;
  /** Accepted calendar blocks, for the per-card conflict check. */
  busy?: BusyInterval[];
}

type Dir = 1 | -1;
type SwipeAction = { kind: "resolve"; status: ResolveStatus } | { kind: "navigate"; href: string };

/** What a swipe in each direction does for a given card. Left always skips. */
function swipeAction(card: DigestCardData, dir: Dir): SwipeAction {
  if (dir === -1) return { kind: "resolve", status: "dismissed" };
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
    default:
      return { kind: "resolve", status: "saved" };
  }
}

/** Button + swipe-stamp labels per card type. */
function labels(card: DigestCardData): { left: string; right: string; rightIcon: LucideIcon } {
  switch (card.type) {
    case "social_invite":
      return { left: "Can't go", right: "Going", rightIcon: Check };
    case "calendar_radar":
      return { left: "Skip", right: "Add", rightIcon: Check };
    case "event_update":
      return { left: "Dismiss", right: "Got it", rightIcon: Check };
    case "time_poll":
      return { left: "Skip", right: "Respond", rightIcon: ArrowUpRight };
    case "broadcast_bundle":
      return { left: "Dismiss all", right: "View all", rightIcon: ArrowUpRight };
    default:
      return { left: "Skip", right: "Save", rightIcon: Bookmark };
  }
}

/** Tinder-style deck: one card at a time, swipe or tap to resolve. */
export function DigestFeed({ initialCards, dateLabel, persist = false, busy = [] }: DigestFeedProps) {
  const [cards, setCards] = useState<DigestCardData[]>(initialCards);
  const [saved, setSaved] = useState(0);
  const [accepted, setAccepted] = useState(0);
  const [dir, setDir] = useState<Dir>(1);

  const total = initialCards.length;
  const done = total - cards.length;
  const top = cards[0];

  const resolve = (id: string, status: ResolveStatus) => {
    const card = cards.find((c) => c.id === id);
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (status === "saved") setSaved((n) => n + 1);
    if (status === "accepted") setAccepted((n) => n + 1);
    if (persist) {
      if (card && card.type === "broadcast_bundle") {
        for (const cid of card.cardIds) void updateCardStatus(cid, status);
      } else {
        void updateCardStatus(id, status);
      }
    }
  };

  /** Swipe (or tap) the top card in a direction. */
  const act = (d: Dir) => {
    if (!top) return;
    const a = swipeAction(top, d);
    if (a.kind === "navigate") {
      window.location.assign(a.href);
      return;
    }
    setDir(d);
    resolve(top.id, a.status);
  };

  // Desktop: ← / → swipe the top card. A ref keeps the listener on the latest
  // `act` without re-binding every render.
  const actRef = useRef(act);
  useEffect(() => {
    actRef.current = act;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      actRef.current(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** In-card actions (e.g. Add to calendar) leave in the matching direction. */
  const onCardResolve = (id: string, status: ResolveStatus) => {
    setDir(status === "dismissed" ? -1 : 1);
    resolve(id, status);
  };

  return (
    <div className="w-full">
      <DeckHeader dateLabel={dateLabel} done={done} total={total} />

      {top ? (
        <>
          <div className="relative pt-4">
            {cards.length > 2 && (
              <div className="absolute inset-x-6 top-0 h-10 rounded-3xl bg-neutral-200/70" aria-hidden />
            )}
            {cards.length > 1 && (
              <div className="absolute inset-x-3 top-2 h-10 rounded-[26px] bg-neutral-100 shadow-sm" aria-hidden />
            )}
            <AnimatePresence custom={dir} initial={false} mode="popLayout">
              <SwipeCard key={top.id} card={top} busy={busy} onSwipe={act} onResolve={onCardResolve} />
            </AnimatePresence>
            <SideArrow side="left" label={labels(top).left} onClick={() => act(-1)} />
            <SideArrow side="right" label={labels(top).right} onClick={() => act(1)} />
          </div>
          <DeckControls card={top} onAct={act} />
        </>
      ) : (
        <AllCaughtUp saved={saved} accepted={accepted} />
      )}
    </div>
  );
}

/** Enter from slightly behind; exit flies off in the swipe direction
 *  (`custom` comes from AnimatePresence, since the leaving card can't get props). */
const CARD_VARIANTS: Variants = {
  enter: { scale: 0.96, opacity: 0, y: 10 },
  center: { scale: 1, opacity: 1, y: 0 },
  exit: (d: Dir) => ({
    x: d * 560,
    rotate: d * 14,
    opacity: 0,
    transition: { duration: 0.24, ease: "easeIn" },
  }),
};

/** The top card, draggable horizontally with a tilt and a stamp label. */
function SwipeCard({
  card,
  busy,
  onSwipe,
  onResolve,
}: {
  card: DigestCardData;
  busy: BusyInterval[];
  onSwipe: (d: Dir) => void;
  onResolve: (id: string, status: ResolveStatus) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 0, 260], [-10, 0, 10]);
  const rightOpacity = useTransform(x, [30, 120], [0, 1]);
  const leftOpacity = useTransform(x, [-120, -30], [1, 0]);
  const l = labels(card);

  return (
    <motion.div
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.85}
      onDragEnd={(_, info) => {
        if (info.offset.x > 110 || info.velocity.x > 650) onSwipe(1);
        else if (info.offset.x < -110 || info.velocity.x < -650) onSwipe(-1);
      }}
      variants={CARD_VARIANTS}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="relative z-10 cursor-grab touch-pan-y select-none active:cursor-grabbing"
    >
      <motion.span
        style={{ opacity: rightOpacity }}
        className="pointer-events-none absolute left-5 top-5 z-20 -rotate-6 rounded-lg border-2 border-emerald-600 bg-white/95 px-2.5 py-1 text-sm font-bold uppercase tracking-wide text-emerald-700"
        aria-hidden
      >
        {l.right}
      </motion.span>
      <motion.span
        style={{ opacity: leftOpacity }}
        className="pointer-events-none absolute right-5 top-5 z-20 rotate-6 rounded-lg border-2 border-neutral-500 bg-white/95 px-2.5 py-1 text-sm font-bold uppercase tracking-wide text-neutral-700"
        aria-hidden
      >
        {l.left}
      </motion.span>
      <DigestCard card={card} busy={busy} onResolve={onResolve} />
    </motion.div>
  );
}

/** Desktop-only arrows flanking the card (md+, where there's room beside it). */
function SideArrow({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} (${side === "left" ? "←" : "→"} key)`}
      title={`${label} (${side === "left" ? "←" : "→"})`}
      className={`absolute top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-900 active:scale-95 md:flex ${
        side === "left" ? "-left-[72px]" : "-right-[72px]"
      }`}
    >
      <Icon className="h-6 w-6" strokeWidth={2.2} />
    </button>
  );
}

function DeckControls({ card, onAct }: { card: DigestCardData; onAct: (d: Dir) => void }) {
  const l = labels(card);
  const RightIcon = l.rightIcon;
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <div className="flex items-start gap-12">
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAct(-1)}
            aria-label={l.left}
            className="flex h-[60px] w-[60px] items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:scale-95"
          >
            <X className="h-6 w-6" strokeWidth={2.2} />
          </button>
          <span className="text-xs font-medium text-neutral-600">{l.left}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAct(1)}
            aria-label={l.right}
            className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-fuchsia-700 text-white shadow-[0_6px_16px_rgba(181,82,74,0.28)] transition hover:bg-fuchsia-800 active:scale-95"
          >
            <RightIcon className="h-6 w-6" strokeWidth={2.2} />
          </button>
          <span className="text-xs font-medium text-neutral-600">{l.right}</span>
        </div>
      </div>
      <p className="text-xs text-neutral-500 md:hidden">
        Swipe left to {l.left.toLowerCase()} · right to {l.right.toLowerCase()}
      </p>
      <p className="hidden items-center gap-1.5 text-xs text-neutral-500 md:flex">
        <Kbd>←</Kbd> {l.left.toLowerCase()}
        <span className="mx-1">·</span>
        <Kbd>→</Kbd> {l.right.toLowerCase()}
        <span className="mx-1">·</span>
        or drag the card
      </p>
    </div>
  );
}

/** "Today" title, the date, a "3 of 8" count and a segmented progress bar. */
export function DeckHeader({ dateLabel, done, total }: { dateLabel: string; done: number; total: number }) {
  return (
    <header className="mb-5 space-y-3.5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[13px] font-medium text-neutral-500">{dateLabel}</p>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900">Today</h1>
        </div>
        {total > 0 && (
          <span className="pb-1.5 text-[13px] font-semibold text-neutral-500">
            {Math.min(done + 1, total)} of {total}
          </span>
        )}
      </div>
      {total > 0 && (
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i < done ? "bg-neutral-900" : i === done ? "bg-fuchsia-700" : "bg-neutral-200"
              }`}
            />
          ))}
        </div>
      )}
    </header>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-neutral-300 bg-white px-1 font-sans text-[11px] font-semibold text-neutral-700 shadow-[0_1px_0_rgba(0,0,0,0.08)]">
      {children}
    </kbd>
  );
}
