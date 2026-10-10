"use client";

import { useEffect, useState, type ComponentType } from "react";
import {
  MapPin,
  Calendar as CalendarIcon,
  Hourglass,
  ArrowUpRight,
  Pencil,
  Loader2,
  Check,
  Send,
  Crown,
  Users,
  DollarSign,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type {
  DigestCardData,
  SocialInviteCard,
  CalendarRadarCard,
  TimeWindowCard,
} from "@/lib/types";
import { windowStatus } from "@/lib/timeWindow";
import { startKey, cardIso, dayInTz } from "@/lib/calendarSort";
import { updateCardStatus, updateEventCard } from "@/app/feed-actions";
import { updateHostEvent, toggleReinvite } from "@/app/event-actions";
import { InviteComposer } from "./InviteComposer";
import { DateTimeField, type DTValue } from "./DateTimeField";
import { clientTimeZone, isoFromLocal, localFromIso, formatWhen, labelHasTime } from "@/lib/localDateTime";
import { isRedundantNote } from "@/lib/noteText";
import { GuestFaces } from "./GuestFaces";
import { EmptyState } from "./LibraryWall";

type Variant = "upcoming" | "past";

/** A calendar event card (the three types the Calendar renders). */
type EventCard = SocialInviteCard | CalendarRadarCard | TimeWindowCard;

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
  // One card open at a time — tapping another closes the previous.
  const [openId, setOpenId] = useState<string | null>(null);

  const remove = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    setOpenId((cur) => (cur === id ? null : cur));
    void updateCardStatus(id, "dismissed");
  };

  const apply = (updated: DigestCardData) => {
    setCards((prev) => {
      const next = prev.map((c) => (c.id === updated.id ? updated : c));
      next.sort((a, b) =>
        variant === "past" ? startKey(b) - startKey(a) : startKey(a) - startKey(b),
      );
      return next;
    });
  };

  if (cards.length === 0) {
    return variant === "past" ? (
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
    );
  }

  // Group into day sections so the DATE lives once in a header — each row then
  // only shows its time-of-day, never the weekday+date again.
  const groups = groupByDay(cards, tz, variant === "past");

  return (
    <div className="space-y-6">
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
                expanded={openId === card.id}
                onToggle={() => setOpenId((cur) => (cur === card.id ? null : card.id))}
                onRemove={() => remove(card.id)}
                onUpdate={apply}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
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

/** "Sat, Oct 10 · 7:00 PM" (or just the date for an all-day item) in tz. */
function fullWhen(card: EventCard, tz: string): string {
  if (card.type === "time_window") return windowStatus({ expiresAt: card.expiresAt, opensAt: card.opensAt })?.label ?? "";
  const iso = card.startsAt;
  const label = card.type === "social_invite" ? card.eventTime : card.time;
  if (!iso || Number.isNaN(Date.parse(iso))) return label ?? "";
  const d = new Date(iso);
  const opts = (o: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).format(d);
    } catch {
      return new Intl.DateTimeFormat("en-US", o).format(d);
    }
  };
  const date = opts({ weekday: "short", month: "short", day: "numeric" });
  return labelHasTime(label) ? `${date} · ${opts({ hour: "numeric", minute: "2-digit" })}` : date;
}

/**
 * One compact agenda row. Tapping it pops the event up as a card (details +
 * small icon actions). A pending invite someone sent you carries small
 * Accept / Decline icons right on the row.
 */
function EventRow({
  card,
  past,
  tz,
  viewerId,
  expanded,
  onToggle,
  onRemove,
  onUpdate,
}: {
  card: DigestCardData;
  past: boolean;
  tz: string;
  viewerId: string;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (updated: DigestCardData) => void;
}) {
  if (
    card.type !== "social_invite" &&
    card.type !== "calendar_radar" &&
    card.type !== "time_window"
  ) {
    return null;
  }

  const isInvite = card.type === "social_invite";
  const isWindow = card.type === "time_window";
  const isPending = isInvite && card.status === "pending";
  const barClass = rowBar(card);
  const title = isInvite ? card.eventTitle : card.title;
  const location = !isWindow ? card.location : undefined;
  const eventId = isInvite ? card.eventId : undefined;

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
              <p className="mb-0.5 text-[12px] font-semibold text-fuchsia-700">
                {card.senderName} invited you
              </p>
            )}
            <h3 className="text-[15px] font-semibold leading-snug text-neutral-900">{title}</h3>
            {location && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-neutral-600">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{location}</span>
              </p>
            )}
            {isWindow && <p className="mt-0.5 text-[13px] text-neutral-500">Saved from Today</p>}
            {eventId && !isPending && (
              <div className="mt-1.5">
                <GuestFaces eventId={eventId} />
              </div>
            )}
          </div>
    </>
  );

  // The popup sits outside the (possibly faded) row so it isn't dimmed or
  // trapped in the row's stacking context.
  return (
    <div>
    <div className={`flex gap-3 ${past ? "opacity-80" : ""}`}>
      <TimeTile card={card} tz={tz} />
      <div
        className={`flex min-w-0 flex-1 items-center overflow-hidden rounded-2xl ${
          isPending
            ? "border border-dashed border-fuchsia-300 bg-fuchsia-50/40"
            : "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
        }`}
      >
        {eventId ? (
          // Shared events have a full page — go straight there.
          <Link href={`/event/${eventId}`} className="flex min-w-0 flex-1 gap-3 p-3.5 text-left">
            {rowBody}
          </Link>
        ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-haspopup="dialog"
          className="flex min-w-0 flex-1 gap-3 p-3.5 text-left"
        >
          {rowBody}
        </button>
        )}

        {isPending && !past && (
          <div className="flex shrink-0 items-center gap-1.5 pr-3">
            <IconButton label="Decline" icon={X} onClick={() => respond(false)} />
            <IconButton label="Accept" icon={Check} onClick={() => respond(true)} tone="primary" />
          </div>
        )}
      </div>
    </div>

      <AnimatePresence>
        {expanded && (
          <EventPopup
            key="popup"
            card={card}
            past={past}
            tz={tz}
            viewerId={viewerId}
            onClose={onToggle}
            onRemove={onRemove}
            onUpdate={onUpdate}
            onRespond={respond}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Invites fuchsia (pale while unanswered) · your own plans sky · saved-from-Today amber. */
function rowBar(card: EventCard): string {
  if (card.type === "social_invite") return card.status === "pending" ? "bg-fuchsia-300" : "bg-fuchsia-600";
  return card.type === "calendar_radar" ? "bg-sky-600" : "bg-amber-500";
}

/** The popped-up event card: details, small icon actions, inline edit. */
function EventPopup({
  card,
  past,
  tz,
  viewerId,
  onClose,
  onRemove,
  onUpdate,
  onRespond,
}: {
  card: EventCard;
  past: boolean;
  tz: string;
  viewerId: string;
  onClose: () => void;
  onRemove: () => void;
  onUpdate: (updated: DigestCardData) => void;
  onRespond: (accept: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Esc closes (unless the invite sheet is on top, which handles its own close).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !inviting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, inviting]);

  const isInvite = card.type === "social_invite";
  const isWindow = card.type === "time_window";
  const isRadar = card.type === "calendar_radar";
  const isPending = isInvite && card.status === "pending";

  const hostId = isInvite ? card.hostId : undefined;
  const isHost = isInvite && !!hostId && hostId === viewerId;
  const isGuest = isInvite && !!hostId && !isHost;
  const eventId = isInvite ? card.eventId : undefined;
  const allowReinvite = isInvite ? !!card.allowReinvite : false;

  const canEditHost = isInvite && isHost && !!eventId && !past;
  const canEditPersonal = isRadar && !past;
  const canEdit = canEditHost || canEditPersonal;

  // Inviting a personal/saved item turns it into a shared event behind the
  // scenes (you become its host); on a shared event it invites more people.
  const isPromote = (isWindow || isRadar) && !past;
  const canReinvite =
    isInvite && !isPending && !!eventId && !past && (isHost || (isGuest && allowReinvite));
  const canInvite = isPromote || canReinvite;

  const title = isInvite ? card.eventTitle : card.title;
  const timeLabel = isInvite ? card.eventTime : isRadar ? card.time : "";
  const location = !isWindow ? card.location : undefined;
  const radarDetails = isRadar ? card.details : undefined;
  const sourceUrl = isInvite ? card.sourceUrl : isWindow ? card.actionUrl : undefined;
  const when = fullWhen(card, tz);

  const inviteTarget = isPromote
    ? ({ kind: "source", cardId: card.id } as const)
    : ({ kind: "event", eventId: eventId as string } as const);

  const actions: QuickAction[] = [];
  if (!past && !isPending) {
    if (canInvite)
      actions.push({
        label: isPromote ? "Invite friends" : "Invite more friends",
        icon: Send,
        onClick: () => setInviting(true),
        tone: "primary",
      });
    if (canEdit) actions.push({ label: "Edit", icon: Pencil, onClick: () => setEditing(true) });
  }
  if (eventId) actions.push({ label: "Open event page", icon: ArrowUpRight, href: `/event/${eventId}` });
  if (!isPending)
    actions.push({
      label: "Remove from calendar",
      icon: Trash2,
      onClick: () => {
        onClose();
        onRemove();
      },
      tone: "danger",
    });

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-[24px] bg-white shadow-[0_24px_60px_rgba(24,24,27,0.25)]"
      >
        <div className={`h-1.5 w-full ${rowBar(card)}`} aria-hidden />
        <div className="p-5">
          {/* Top line: when + small icon actions + close */}
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-[13px] font-semibold text-neutral-500">{when}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              {!editing && actions.map((a) => <IconButton key={a.label} {...a} />)}
              <IconButton label="Close" icon={X} onClick={onClose} />
            </div>
          </div>

          {editing && canEdit ? (
            <div className="mt-3">
              <EditForm
                card={card as SocialInviteCard | CalendarRadarCard}
                mode={canEditHost ? "host" : "personal"}
                eventId={eventId}
                onCancel={() => setEditing(false)}
                onSaved={(updated) => {
                  onUpdate(updated);
                  setEditing(false);
                }}
              />
            </div>
          ) : (
            <>
              {isPending && (
                <p className="mt-3 text-[13px] font-semibold text-fuchsia-700">{card.senderName} invited you</p>
              )}
              <h2 className={`${isPending ? "mt-0.5" : "mt-3"} text-[22px] font-bold leading-tight tracking-tight text-neutral-900`}>
                {title}
              </h2>
              {location && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 flex items-center gap-1.5 text-[14px] text-neutral-600 hover:text-neutral-900"
                >
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="truncate">{location}</span>
                </a>
              )}
              {eventId && (
                <div className="mt-3">
                  <GuestFaces eventId={eventId} />
                </div>
              )}

              <div className="mt-3 space-y-1.5 text-[14px] leading-relaxed text-neutral-600">
                {isInvite && isHost && (
                  <p className="flex items-center gap-1.5 font-medium text-fuchsia-700">
                    <Crown className="h-4 w-4" /> You&rsquo;re hosting
                  </p>
                )}
                {isInvite && isGuest && (
                  <p className="text-neutral-500">
                    Hosted by {card.hostName ?? card.senderName}
                    <span className="ml-1 text-neutral-400">· only they can edit</span>
                  </p>
                )}
                {isInvite && card.note && !isRedundantNote(card.note, { time: timeLabel, location }) && (
                  <p className="whitespace-pre-wrap text-neutral-700">{card.note}</p>
                )}
                {isInvite && card.summary && <p>{card.summary}</p>}
                {isInvite && card.fee && card.fee > 0 && (
                  <p className="flex items-center gap-1 font-medium text-neutral-700">
                    <DollarSign className="h-3.5 w-3.5 text-neutral-400" strokeWidth={2} />
                    {money(card.fee)} to join
                  </p>
                )}
                {radarDetails && !isRedundantNote(radarDetails, { time: timeLabel, location }) && (
                  <p className="whitespace-pre-wrap text-neutral-700">{radarDetails}</p>
                )}
                {isWindow && card.summary && <p>{card.summary}</p>}
                {isWindow && <p className="text-[13px] text-neutral-500">Saved from Today</p>}
                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-neutral-800 underline-offset-2 hover:underline"
                  >
                    {isWindow ? card.actionLabel : "Original listing"}
                    <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </a>
                )}
              </div>

              {isPending && !past && (
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onRespond(false);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 text-[13px] font-semibold text-neutral-700 transition hover:bg-neutral-50"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.4} /> Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onRespond(true);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fuchsia-700 px-3.5 text-[13px] font-semibold text-white transition hover:bg-fuchsia-800"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.4} /> Accept
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>

      {inviting && (
        <div onClick={(e) => e.stopPropagation()}>
          <InviteComposer
            eventTitle={title}
            target={inviteTarget}
            onClose={() => setInviting(false)}
          />
        </div>
      )}
    </motion.div>
  );
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

/* -------------------------------- edit form ------------------------------- */

function EditForm({
  card,
  mode,
  eventId,
  onCancel,
  onSaved,
}: {
  card: SocialInviteCard | CalendarRadarCard;
  mode: "host" | "personal";
  eventId?: string;
  onCancel: () => void;
  onSaved: (updated: DigestCardData) => void;
}) {
  const tz = clientTimeZone();
  const isInvite = card.type === "social_invite";
  const initialReinvite = card.type === "social_invite" ? !!card.allowReinvite : false;
  const [title, setTitle] = useState(isInvite ? card.eventTitle : card.title);
  const [dt, setDt] = useState<DTValue>(() => {
    const hasTime = labelHasTime(isInvite ? card.eventTime : card.time);
    const local = card.startsAt ? localFromIso(card.startsAt, tz) : null;
    if (local) return { date: local.date, time: hasTime ? local.time : null };
    const now = localFromIso(new Date().toISOString(), tz);
    return { date: now?.date ?? "", time: null };
  });
  const [location, setLocation] = useState(card.location ?? "");
  const [note, setNote] = useState((isInvite ? card.note : card.details) ?? "");
  const [allowReinvite, setAllowReinvite] = useState(initialReinvite);
  const [feeStr, setFeeStr] = useState(isInvite && card.fee ? String(card.fee / 100) : "");
  const [paymentLink, setPaymentLink] = useState(isInvite ? card.paymentLink ?? "" : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field =
    "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

  async function save() {
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    const startsAt = isoFromLocal(dt.date, dt.time, tz);
    if (!startsAt) {
      setError("Pick a date.");
      return;
    }
    const hasTime = dt.time !== null;
    const when = formatWhen(startsAt, tz, hasTime);

    setSaving(true);
    setError(null);

    const parsedFee = parseFloat(feeStr);
    const feeCents =
      feeStr.trim() && Number.isFinite(parsedFee) && parsedFee > 0
        ? Math.round(parsedFee * 100)
        : null;

    if (mode === "host" && eventId) {
      const res = await updateHostEvent({
        eventId,
        title: title.trim(),
        whenText: when,
        startsAt,
        hasTime,
        location: location.trim(),
        note: note.trim(),
        feeCents,
        paymentLink: paymentLink.trim(),
      });
      if (!res.ok) {
        setSaving(false);
        setError(res.error ?? "Couldn't save.");
        return;
      }
      // The "let guests invite others" permission lives in edit now — persist it
      // alongside the rest of the host's changes when it was toggled.
      if (allowReinvite !== initialReinvite) {
        await toggleReinvite({ eventId, allow: allowReinvite });
      }
    } else {
      const res = await updateEventCard({
        id: card.id,
        type: card.type as "social_invite" | "calendar_radar",
        title: title.trim(),
        whenText: when,
        startsAt,
        hasTime,
        location: location.trim(),
        note: note.trim(),
      });
      if (!res.ok) {
        setSaving(false);
        setError(res.error ?? "Couldn't save.");
        return;
      }
    }

    setSaving(false);
    const loc = location.trim() || undefined;
    const nt = note.trim() || undefined;
    const updated: DigestCardData = isInvite
      ? {
          ...(card as SocialInviteCard),
          eventTitle: title.trim(),
          eventTime: when,
          startsAt,
          location: loc,
          note: nt,
          allowReinvite,
          fee: feeCents ?? undefined,
          paymentLink: paymentLink.trim() || undefined,
        }
      : { ...(card as CalendarRadarCard), title: title.trim(), time: when, startsAt, location: loc, details: nt };
    onSaved(updated);
  }

  return (
    <div className="space-y-2.5">
      {mode === "host" && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          Editing as host — guests&rsquo; calendars update automatically.
        </p>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
      </label>
      <div>
        <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">When</span>
        <DateTimeField value={dt} onChange={setDt} />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Location</span>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="optional"
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {isInvite ? "Note" : "Details"}
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="optional"
          rows={4}
          className={`${field} max-h-40 resize-y overflow-y-auto whitespace-pre-wrap break-words`}
        />
      </label>

      {/* Host-only: participation fee + pay link. No real money is processed. */}
      {mode === "host" && isInvite && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Fee to join ($)
            </span>
            <input
              value={feeStr}
              onChange={(e) => setFeeStr(e.target.value)}
              inputMode="decimal"
              placeholder="blank = free"
              className={field}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Payment link
            </span>
            <input
              value={paymentLink}
              onChange={(e) => setPaymentLink(e.target.value)}
              placeholder="venmo.com/you"
              className={field}
            />
          </label>
        </div>
      )}

      {/* Host-only permission — lives in Edit, not on the read-only card. */}
      {mode === "host" && isInvite && (
        <label className="flex items-center gap-2 pt-0.5 text-sm text-neutral-600 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={allowReinvite}
            onChange={(e) => setAllowReinvite(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400 dark:border-neutral-600"
          />
          <Users className="h-3.5 w-3.5 text-neutral-400" />
          Let guests invite others
        </label>
      )}

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" /> Save
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/** Integer cents → "$40" / "$16.67". */
function money(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
