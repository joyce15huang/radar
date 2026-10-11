"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  MapPin,
  Calendar as CalendarIcon,
  Hourglass,
  Loader2,
  Check,
  X,
  Send,
  Trash2,
} from "lucide-react";
import { animate, motion, useMotionValue } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  CardStatus,
  DigestCardData,
  SocialInviteCard,
  CalendarRadarCard,
  TimeWindowCard,
} from "@/lib/types";
import { labelHasTime } from "@/lib/localDateTime";
import { startKey, cardIso, dayInTz } from "@/lib/calendarSort";
import { updateCardStatus } from "@/app/feed-actions";
import { openAsEvent, planGuestCount, cancelEvent } from "@/app/event-actions";
import { InviteComposer } from "./InviteComposer";
import { EmptyState } from "./LibraryWall";

type Variant = "upcoming" | "past";

/** A calendar event card (the three types the Calendar renders). */
type EventCard = SocialInviteCard | CalendarRadarCard | TimeWindowCard;
type InviteTarget = { kind: "event"; eventId: string } | { kind: "source"; cardId: string };

const DAY_MS = 86_400_000;

export function CalendarList({
  initial,
  variant = "upcoming",
  tz,
  viewerId,
}: {
  initial: DigestCardData[];
  variant?: Variant;
  tz: string;
  viewerId: string;
}) {
  const [cards, setCards] = useState(initial);
  // Phone: rows swipe left to show Send / Delete. Desktop: they fade in on hover.
  const [touch, setTouch] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inviting, setInviting] = useState<{ title: string; target: InviteTarget } | null>(null);
  const [confirm, setConfirm] = useState<{ card: EventCard; eventId: string; guests: number } | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setTouch(window.matchMedia("(pointer: coarse)").matches);
    } catch {
      /* old browser: hover actions */
    }
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const sortList = (list: DigestCardData[]) =>
    list.sort((a, b) => (variant === "past" ? startKey(b) - startKey(a) : startKey(a) - startKey(b)));

  const showToast = (t: { text: string; undo?: () => void }) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const remove = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    void updateCardStatus(id, "dismissed");
  };

  /** Off your calendar, with a few seconds to take it back. */
  const softRemove = (card: EventCard) => {
    const prevStatus: CardStatus = card.status === "dismissed" ? "accepted" : card.status;
    setSwipeOpen(null);
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    void updateCardStatus(card.id, "dismissed");
    showToast({
      text: `Removed \u201c${titleOf(card)}\u201d`,
      undo: () => {
        setCards((prev) => sortList([...prev.filter((c) => c.id !== card.id), card]));
        void updateCardStatus(card.id, prevStatus);
        setToast(null);
      },
    });
  };

  const askDelete = async (card: EventCard) => {
    const isInvite = card.type === "social_invite";
    const host = !isInvite || (!!card.hostId && card.hostId === viewerId);
    // A plan you host that has guests: cancel it for everyone (confirm first).
    if (isInvite && host && card.eventId && variant !== "past") {
      const guests = await planGuestCount(card.eventId).catch(() => 0);
      if (guests > 0) {
        setSwipeOpen(null);
        setCancelError(null);
        setConfirm({ card, eventId: card.eventId, guests });
        return;
      }
    }
    softRemove(card);
  };

  const confirmCancel = async () => {
    if (!confirm || canceling) return;
    setCanceling(true);
    setCancelError(null);
    const res = await cancelEvent(confirm.eventId);
    setCanceling(false);
    if (!res.ok) return setCancelError(res.error ?? "Couldn't cancel the plan.");
    const id = confirm.card.id;
    setCards((prev) => prev.filter((c) => c.id !== id));
    setConfirm(null);
    showToast({
      text: res.notified ? `Canceled \u2014 ${res.notified} ${res.notified === 1 ? "guest" : "guests"} told` : "Plan canceled",
    });
  };

  const send = (card: EventCard) => {
    setSwipeOpen(null);
    const target: InviteTarget =
      card.type === "social_invite" && card.eventId
        ? { kind: "event", eventId: card.eventId }
        : { kind: "source", cardId: card.id };
    setInviting({ title: titleOf(card), target });
  };

  const apply = (updated: DigestCardData) => {
    setCards((prev) => sortList(prev.map((c) => (c.id === updated.id ? updated : c))));
  };

  const overlays = (
    <>
      {inviting && (
        <InviteComposer eventTitle={inviting.title} target={inviting.target} onClose={() => setInviting(null)} />
      )}

      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center"
          onClick={() => !canceling && setConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cancel plan"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-[24px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_24px_60px_rgba(24,24,27,0.25)] sm:pb-5"
          >
            <h2 className="text-[18px] font-bold leading-snug text-neutral-900">
              Cancel &ldquo;{titleOf(confirm.card)}&rdquo;?
            </h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-neutral-600">
              It comes off everyone&rsquo;s calendar. {confirm.guests} {confirm.guests === 1 ? "guest" : "guests"} will get a
              note on Today that it&rsquo;s canceled.
            </p>
            {cancelError && <p className="mt-2 text-[13px] font-medium text-rose-600">{cancelError}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={canceling}
                className="h-12 rounded-2xl bg-neutral-100 text-[15px] font-semibold text-neutral-800 transition hover:bg-neutral-200 disabled:opacity-60"
              >
                Keep plan
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={canceling}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-600 text-[15px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {canceling && <Loader2 className="h-4 w-4 animate-spin" />}
                Cancel for everyone
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 whitespace-nowrap rounded-full bg-neutral-900 py-2.5 pl-4 pr-2 text-[14px] text-white shadow-[0_12px_30px_rgba(24,24,27,0.3)]"
        >
          <span className="max-w-[60vw] truncate">{toast.text}</span>
          {toast.undo ? (
            <button type="button" onClick={toast.undo} className="rounded-full px-3 py-1 font-semibold text-amber-300 hover:bg-white/10">
              Undo
            </button>
          ) : (
            <span className="w-1" />
          )}
        </div>
      )}
    </>
  );

  if (cards.length === 0) {
    return (
      <>
        {variant === "past" ? (
          <EmptyState
            icon={<Hourglass className="h-7 w-7" strokeWidth={2} />}
            title="Nothing in the past yet"
            body="Events settle here automatically once their day passes — a calm archive you can look back on."
          />
        ) : (
          <EmptyState
            icon={<CalendarIcon className="h-7 w-7" strokeWidth={2} />}
            title="No events yet"
            body="Add a plan above, or say Going to an invite, and it'll show up here."
          />
        )}
        {overlays}
      </>
    );
  }

  // Group into day sections so the DATE lives once in a header — each row then
  // only shows its time-of-day, never the weekday+date again.
  const groups = groupByDay(cards, tz, variant === "past");

  return (
    <div
      className="space-y-6"
      // Tapping anywhere else closes an open swipe.
      onPointerDownCapture={(e) => {
        if (!swipeOpen) return;
        const row = (e.target as HTMLElement).closest("[data-row]");
        if (!row || row.getAttribute("data-row") !== swipeOpen) setSwipeOpen(null);
      }}
    >
      {groups.map((g) => (
        <section key={g.key} id={`day-${g.key}`} className="scroll-mt-4">
          <h3 className="mb-2 px-1 text-[13px] font-semibold text-neutral-600">{g.label}</h3>
          <div className="space-y-2">
            {g.cards.map((card) => (
              <EventRow
                key={card.id}
                card={card}
                past={variant === "past"}
                tz={tz}
                viewerId={viewerId}
                touch={touch}
                swiped={swipeOpen === card.id}
                onSwipe={(open) => setSwipeOpen(open ? card.id : null)}
                onSend={send}
                onDelete={askDelete}
                onRemove={() => remove(card.id)}
                onUpdate={apply}
              />
            ))}
          </div>
        </section>
      ))}
      {overlays}
    </div>
  );
}

function titleOf(card: EventCard): string {
  return card.type === "social_invite" ? card.eventTitle : card.title;
}

/* ------------------------------ day grouping ------------------------------ */

interface DayGroup {
  key: string;
  label: string;
  cards: DigestCardData[];
}

function ymdParts(day: string): { y: number; mo: number; d: number } {
  const [y, mo, d] = day.split("-").map(Number);
  return { y, mo, d };
}

/** "Wednesday, Aug 12" from a YYYY-MM-DD calendar day (tz-independent). */
function dayLabelFromYmd(day: string): string {
  const { y, mo, d } = ymdParts(day);
  if (!y || !mo || !d) return day;
  const dt = new Date(Date.UTC(y, mo - 1, d, 12));
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(dt);
  const md = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(dt);
  return `${wd}, ${md}`;
}

/** Just the weekday ("Thursday") for a YYYY-MM-DD day. */
function weekdayFromYmd(day: string): string {
  const { y, mo, d } = ymdParts(day);
  if (!y || !mo || !d) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(new Date(Date.UTC(y, mo - 1, d, 12)));
}

/** Bucket cards by their calendar day in tz, preserving the incoming (sorted) order. */
function groupByDay(cards: DigestCardData[], tz: string, past: boolean): DayGroup[] {
  const now = Date.now();
  const today = dayInTz(now, tz);
  const tomorrow = dayInTz(now + DAY_MS, tz);
  const yesterday = dayInTz(now - DAY_MS, tz);

  const order: string[] = [];
  const map = new Map<string, DigestCardData[]>();
  for (const c of cards) {
    const iso = cardIso(c);
    const day = iso ? dayInTz(iso, tz) : null;
    const key = day ?? "undated";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(c);
  }

  return order.map((key) => {
    let label: string;
    if (key === "undated") label = "No date yet";
    else if (key === today) label = `Today · ${weekdayFromYmd(key)}`;
    else if (!past && key === tomorrow) label = `Tomorrow · ${weekdayFromYmd(key)}`;
    else if (past && key === yesterday) label = "Yesterday";
    else label = dayLabelFromYmd(key);
    return { key, label, cards: map.get(key)! };
  });
}

/* -------------------------------- time tile ------------------------------- */

/** Time-of-day (e.g. "5:30 PM") derived from the machine ISO in tz. */
function timeOfDay(iso: string | undefined, tz: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
      new Date(t),
    );
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(t));
  }
}

/** Compact "closes in" label for a window tile: "2d" / "5h" / "soon" / "ended". */
function shortCountdown(card: TimeWindowCard): string {
  const iso = card.expiresAt ?? card.opensAt;
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const ms = t - Date.now();
  if (ms <= 0) return "ended";
  const days = Math.ceil(ms / DAY_MS);
  if (days >= 1) return `${days}d`;
  const hours = Math.ceil(ms / 3_600_000);
  return hours >= 1 ? `${hours}h` : "soon";
}

/**
 * The leading tinted square (type-colored, like a date chip) — but the date now
 * lives in the day header, so the tile carries the useful *time*: stacked
 * "5:30 / PM", a sun + "All day" for a dateless-time item, or an hourglass +
 * short countdown for a window.
 */
function TimeTile({ card, tz }: { card: EventCard; tz: string }) {
  // Agenda time column: "6:00" over "PM", "All day", or a window's time left.
  let main = "";
  let sub = "";
  if (card.type === "time_window") {
    const cd = shortCountdown(card);
    main = cd || "Open";
    sub = cd && cd !== "ended" && cd !== "soon" ? "left" : "";
  } else {
    const hasTime = labelHasTime(card.type === "social_invite" ? card.eventTime : card.time);
    const t = hasTime ? timeOfDay(card.startsAt, tz) : "";
    if (t) [main, sub = ""] = t.split(" ");
    else main = card.startsAt ? "All day" : "—";
  }
  return (
    <div className="w-12 shrink-0 pt-3.5 text-right">
      <p className="text-[13px] font-semibold leading-tight tabular-nums text-neutral-800">{main}</p>
      {sub && <p className="text-[11px] font-medium uppercase leading-tight text-neutral-500">{sub}</p>}
    </div>
  );
}

/* -------------------------------- event row ------------------------------- */

interface QuickAction {
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick?: () => void;
  href?: string;
  tone?: "primary" | "danger";
}


interface RowProps {
  card: DigestCardData;
  past: boolean;
  tz: string;
  viewerId: string;
  touch: boolean;
  swiped: boolean;
  onSwipe: (open: boolean) => void;
  onSend: (card: EventCard) => void;
  onDelete: (card: EventCard) => void;
  onRemove: () => void;
  onUpdate: (updated: DigestCardData) => void;
}

/**
 * One compact agenda row. Tapping it opens the plan page. Quick actions —
 * Send and Delete — sit behind a left swipe on phones and fade in on hover on
 * desktop. A pending invite instead carries Accept / Decline right on the row.
 */
function EventRow(props: RowProps) {
  const { card } = props;
  if (card.type !== "social_invite" && card.type !== "calendar_radar" && card.type !== "time_window") return null;
  return <EventRowInner {...props} card={card} />;
}

const ACTION_W = 68;

function EventRowInner({
  card,
  past,
  tz,
  viewerId,
  touch,
  swiped,
  onSwipe,
  onSend,
  onDelete,
  onRemove,
  onUpdate,
}: RowProps & { card: EventCard }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(false);

  const isInvite = card.type === "social_invite";
  const isWindow = card.type === "time_window";
  const isPending = isInvite && card.status === "pending";
  const barClass = rowBar(card);
  const title = titleOf(card);
  const location = !isWindow ? card.location : undefined;
  const eventId = isInvite ? card.eventId : undefined;

  // Your own plans (and saved items) can be sent; a guest only when the host allows it.
  const isHostRow = !isInvite || (!!card.hostId && card.hostId === viewerId);
  const canSend = !past && !isPending && (isHostRow || (isInvite && !!card.allowReinvite));
  const canDelete = !isPending;
  const width = ((canSend ? 1 : 0) + (canDelete ? 1 : 0)) * ACTION_W;
  const swipeable = touch && width > 0;

  const x = useMotionValue(0);
  const dragged = useRef(false);
  useEffect(() => {
    const ctl = animate(x, swiped ? -width : 0, { type: "spring", stiffness: 520, damping: 42 });
    return () => ctl.stop();
  }, [swiped, width, x]);

  // Personal items open the same full page as shared events: the first tap
  // quietly turns the item into an event you host (no one invited yet).
  const openPage = async () => {
    if (opening) return;
    setOpening(true);
    setOpenError(false);
    const res = await openAsEvent(card.id);
    if (res.ok && res.eventId) {
      router.push(`/event/${res.eventId}`);
      return;
    }
    setOpening(false);
    setOpenError(true);
  };

  const respond = (accept: boolean) => {
    if (!accept) {
      onRemove(); // persists "dismissed"
      return;
    }
    onUpdate({ ...card, status: "accepted" });
    void updateCardStatus(card.id, "accepted");
  };

  const rowBody = (
    <>
      <span className={`w-1 shrink-0 self-stretch rounded-full ${barClass}`} aria-hidden />
      <div className="min-w-0 flex-1">
        {isPending && (
          <p className="mb-0.5 text-[12px] font-semibold text-fuchsia-700">{card.senderName} invited you</p>
        )}
        <h3 className="text-[15px] font-semibold leading-snug text-neutral-900">{title}</h3>
        {location && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-neutral-600">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{location}</span>
          </p>
        )}
        {isWindow && <p className="mt-0.5 text-[13px] text-neutral-500">Saved from Today</p>}
        {openError && <p className="mt-0.5 text-[12px] font-medium text-rose-600">Couldn&rsquo;t open — try again</p>}
      </div>
    </>
  );

  return (
    <div data-row={card.id} className={`flex gap-3 ${past ? "opacity-80" : ""}`}>
      <TimeTile card={card} tz={tz} />
      <div
        className={`relative min-w-0 flex-1 overflow-hidden rounded-2xl ${
          isPending ? "" : "shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
        } ${swipeable ? "bg-neutral-200" : ""}`}
      >
        {/* Revealed by a left swipe (phones). */}
        {swipeable && (
          <div className="absolute inset-y-0 right-0 flex" style={{ width }} aria-hidden={!swiped}>
            {canSend && (
              <button
                type="button"
                tabIndex={swiped ? 0 : -1}
                onClick={() => onSend(card)}
                className="flex flex-1 flex-col items-center justify-center gap-1 bg-fuchsia-700 text-[11px] font-semibold text-white"
              >
                <Send className="h-[18px] w-[18px]" strokeWidth={2.1} />
                Send
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                tabIndex={swiped ? 0 : -1}
                onClick={() => onDelete(card)}
                className="flex flex-1 flex-col items-center justify-center gap-1 bg-rose-600 text-[11px] font-semibold text-white"
              >
                <Trash2 className="h-[18px] w-[18px]" strokeWidth={2.1} />
                Delete
              </button>
            )}
          </div>
        )}

        <motion.div
          style={{ x }}
          drag={swipeable ? "x" : false}
          dragDirectionLock
          dragConstraints={{ left: -width, right: 0 }}
          dragElastic={0.06}
          dragMomentum={false}
          onDragStart={() => {
            dragged.current = true;
          }}
          onDragEnd={(_, info) => {
            const open = x.get() < -width / 2.5 || (info.velocity.x < -350 && info.velocity.x < 0);
            const shut = info.velocity.x > 350;
            const next = open && !shut;
            animate(x, next ? -width : 0, { type: "spring", stiffness: 520, damping: 42 });
            onSwipe(next);
            setTimeout(() => {
              dragged.current = false;
            }, 60);
          }}
          onClickCapture={(e) => {
            // A drag, or a tap on an open row, shouldn't open the plan.
            if (dragged.current || swiped) {
              e.preventDefault();
              e.stopPropagation();
              if (swiped && !dragged.current) onSwipe(false);
            }
          }}
          className={`group relative flex min-w-0 items-center ${swipeable ? "touch-pan-y" : ""} ${
            isPending ? "rounded-2xl border border-dashed border-fuchsia-300 bg-fuchsia-50/40" : "bg-white"
          }`}
        >
          {eventId ? (
            <Link href={`/event/${eventId}`} className="flex min-w-0 flex-1 gap-3 p-3.5 text-left" draggable={false}>
              {rowBody}
            </Link>
          ) : (
            <button
              type="button"
              onClick={openPage}
              disabled={opening}
              aria-busy={opening}
              className="flex min-w-0 flex-1 items-center gap-3 p-3.5 text-left"
            >
              {rowBody}
              {opening && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-400" />}
            </button>
          )}

          {isPending && !past && (
            <div className="flex shrink-0 items-center gap-1.5 pr-3">
              <IconButton label="Decline" icon={X} onClick={() => respond(false)} />
              <IconButton label="Accept" icon={Check} onClick={() => respond(true)} tone="primary" />
            </div>
          )}

          {/* Desktop: the same two actions fade in on hover. */}
          {!touch && width > 0 && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1.5 bg-gradient-to-l from-white from-60% to-white/0 pl-10 pr-3 opacity-0 transition-opacity duration-150 focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
              {canSend && <IconButton label="Send" icon={Send} onClick={() => onSend(card)} tone="primary" />}
              {canDelete && <IconButton label="Delete" icon={Trash2} onClick={() => onDelete(card)} tone="danger" />}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

/** Invites fuchsia (pale while unanswered) · your own plans sky · saved-from-Today amber. */
function rowBar(card: EventCard): string {
  if (card.type === "social_invite") return card.status === "pending" ? "bg-fuchsia-300" : "bg-fuchsia-600";
  return card.type === "calendar_radar" ? "bg-sky-600" : "bg-amber-500";
}

/** A small round icon button (label shows as a tooltip + screen-reader name). */
function IconButton({ label, icon: Icon, onClick, href, tone }: QuickAction) {
  const cls = `flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95 ${
    tone === "primary"
      ? "bg-fuchsia-700 text-white hover:bg-fuchsia-800"
      : tone === "danger"
        ? "bg-neutral-100 text-rose-600 hover:bg-rose-50"
        : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
  }`;
  const icon = <Icon className="h-4 w-4" strokeWidth={2.2} />;
  return href ? (
    <Link href={href} aria-label={label} title={label} className={cls}>
      {icon}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cls}>
      {icon}
    </button>
  );
}

