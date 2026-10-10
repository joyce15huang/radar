"use client";

import { useState, type ComponentType } from "react";
import {
  MapPin,
  Calendar as CalendarIcon,
  Hourglass,
  Loader2,
  Check,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  DigestCardData,
  SocialInviteCard,
  CalendarRadarCard,
  TimeWindowCard,
} from "@/lib/types";
import { labelHasTime } from "@/lib/localDateTime";
import { startKey, cardIso, dayInTz } from "@/lib/calendarSort";
import { updateCardStatus } from "@/app/feed-actions";
import { openAsEvent } from "@/app/event-actions";
import { EmptyState } from "./LibraryWall";

type Variant = "upcoming" | "past";

/** A calendar event card (the three types the Calendar renders). */
type EventCard = SocialInviteCard | CalendarRadarCard | TimeWindowCard;

const DAY_MS = 86_400_000;

export function CalendarList({
  initial,
  variant = "upcoming",
  tz,
}: {
  initial: DigestCardData[];
  variant?: Variant;
  tz: string;
  viewerId: string;
}) {
  const [cards, setCards] = useState(initial);

  const remove = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
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


/**
 * One compact agenda row. Tapping it pops the event up as a card (details +
 * small icon actions). A pending invite someone sent you carries small
 * Accept / Decline icons right on the row.
 */
function EventRow({
  card,
  past,
  tz,
  onRemove,
  onUpdate,
}: {
  card: DigestCardData;
  past: boolean;
  tz: string;
  onRemove: () => void;
  onUpdate: (updated: DigestCardData) => void;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(false);

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
            {openError && <p className="mt-0.5 text-[12px] font-medium text-rose-600">Couldn&rsquo;t open — try again</p>}
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
      </div>
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

