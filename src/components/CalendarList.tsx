"use client";

import { useEffect, useState } from "react";
import {
  X,
  MapPin,
  Calendar as CalendarIcon,
  Hourglass,
  Sun,
  ArrowUpRight,
  Pencil,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  UserPlus,
  Crown,
  Users,
} from "lucide-react";
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
  // Expand state lives here (not per-row) so one control can collapse them all.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const setCardExpanded = (id: string, next: boolean) =>
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (next) n.add(id);
      else n.delete(id);
      return n;
    });
  const collapseAll = () => setExpandedIds(new Set());
  const anyExpanded = expandedIds.size > 0;

  const remove = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    setCardExpanded(id, false);
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
        body="RSVP 'Going' to an invite, or add a schedule card to your calendar, and it'll show up here."
      />
    );
  }

  // Group into day sections so the DATE lives once in a header — each row then
  // only shows its time-of-day, never the weekday+date again.
  const groups = groupByDay(cards, tz, variant === "past");

  return (
    <div>
      {anyExpanded && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={collapseAll}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.25} />
            Collapse all
          </button>
        </div>
      )}

      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.key}>
            <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              {g.label}
            </h3>
            <div className="space-y-2">
              {g.cards.map((card) => (
                <EventRow
                  key={card.id}
                  card={card}
                  past={variant === "past"}
                  tz={tz}
                  viewerId={viewerId}
                  expanded={expandedIds.has(card.id)}
                  onExpandedChange={(next) => setCardExpanded(card.id, next)}
                  onRemove={() => remove(card.id)}
                  onUpdate={apply}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
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

/** "Wed · Aug 12" from a YYYY-MM-DD calendar day (tz-independent). */
function dayLabelFromYmd(day: string): string {
  const { y, mo, d } = ymdParts(day);
  if (!y || !mo || !d) return day;
  const dt = new Date(Date.UTC(y, mo - 1, d, 12));
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(dt);
  const md = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(dt);
  return `${wd} · ${md}`;
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
    else if (key === today) label = "Today";
    else if (!past && key === tomorrow) label = "Tomorrow";
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
  const tint =
    card.type === "social_invite"
      ? "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/10 dark:text-fuchsia-300"
      : card.type === "time_window"
        ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"
        : "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300";
  const tile = `flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${tint}`;

  if (card.type === "time_window") {
    const cd = shortCountdown(card);
    return (
      <div className={tile}>
        <Hourglass className="h-4 w-4" strokeWidth={2} />
        {cd && (
          <span className="mt-0.5 text-[0.6rem] font-bold uppercase leading-none tracking-wide">{cd}</span>
        )}
      </div>
    );
  }

  const hasTime = labelHasTime(card.type === "social_invite" ? card.eventTime : card.time);
  const t = hasTime ? timeOfDay(card.startsAt, tz) : "";

  if (!t) {
    return (
      <div className={tile}>
        {card.startsAt ? (
          <>
            <Sun className="h-4 w-4" strokeWidth={2} />
            <span className="mt-0.5 text-[0.5rem] font-semibold uppercase leading-none tracking-wide">
              All day
            </span>
          </>
        ) : (
          <CalendarIcon className="h-4 w-4" strokeWidth={2} />
        )}
      </div>
    );
  }

  const [hm, mer] = t.split(" ");
  return (
    <div className={tile}>
      <span className="text-[0.8rem] font-bold leading-none tabular-nums">{hm}</span>
      {mer && (
        <span className="mt-0.5 text-[0.55rem] font-semibold uppercase leading-none tracking-wide">{mer}</span>
      )}
    </div>
  );
}

/* -------------------------------- event row ------------------------------- */

function EventRow({
  card,
  past,
  tz,
  viewerId,
  expanded,
  onExpandedChange,
  onRemove,
  onUpdate,
}: {
  card: DigestCardData;
  past: boolean;
  tz: string;
  viewerId: string;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  onRemove: () => void;
  onUpdate: (updated: DigestCardData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Collapsing (including "Collapse all") should drop out of edit mode too.
  useEffect(() => {
    if (!expanded && editing) setEditing(false);
  }, [expanded, editing]);

  if (
    card.type !== "social_invite" &&
    card.type !== "calendar_radar" &&
    card.type !== "time_window"
  ) {
    return null;
  }

  const isInvite = card.type === "social_invite";
  const isWindow = card.type === "time_window";
  const isRadar = card.type === "calendar_radar";

  const hostId = isInvite ? card.hostId : undefined;
  const isHost = isInvite && !!hostId && hostId === viewerId;
  const isGuest = isInvite && !!hostId && !isHost;
  const eventId = isInvite ? card.eventId : undefined;
  const allowReinvite = isInvite ? !!card.allowReinvite : false;

  // Editable only by the owner: the host for a shared event, or yourself for a
  // personal schedule item. Guests' invites and time windows are read-only.
  const canEditHost = isInvite && isHost && !!eventId && !past;
  const canEditPersonal = isRadar && !past;
  const canEdit = canEditHost || canEditPersonal;

  // Invite affordances (Calendar-only). Promote a discovered/personal card into a
  // hosted event, or invite more people to an event that already exists.
  const canPromote = (isWindow || isRadar) && !past;
  const canReinvite = isInvite && !!eventId && !past && (isHost || (isGuest && allowReinvite));

  const title = isInvite ? card.eventTitle : card.title;
  // Kept only as context for the note-echo guard (the visible time lives in the tile).
  const timeLabel = isInvite ? card.eventTime : isRadar ? card.time : "";
  const location = !isWindow ? card.location : undefined;

  // Preserved public source (link + countdown) shown on hosted/guest invites.
  const sourceUrl = isInvite ? card.sourceUrl : isWindow ? card.actionUrl : undefined;
  const inviteCountdown = isInvite ? windowStatus({ expiresAt: card.expiresAt, opensAt: card.opensAt }) : null;

  const inviteTarget = canPromote
    ? ({ kind: "source", cardId: card.id } as const)
    : ({ kind: "event", eventId: eventId as string } as const);

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${
        past ? "opacity-80" : ""
      }`}
    >
      <div className="flex gap-3 p-3">
        <TimeTile card={card} tz={tz} />

        <button
          type="button"
          onClick={() => {
            if (editing) return;
            onExpandedChange(!expanded);
          }}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
              {title}
            </h3>
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
              strokeWidth={2}
            />
          </div>
          {!expanded && location && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[0.8rem] text-neutral-500 dark:text-neutral-400">
              <MapPin className="h-3.5 w-3.5" />
              {location}
            </p>
          )}
          {isInvite && eventId && (
            <div className="mt-1.5">
              <GuestFaces eventId={eventId} />
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove from Calendar"
          title="Remove from Calendar"
          className="-mr-1 -mt-1 h-fit rounded-full p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-neutral-100 px-3 pb-3 pt-2.5 dark:border-neutral-800">
          {editing && canEdit ? (
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
          ) : (
            <>
              <div className="space-y-1.5 text-sm text-neutral-600 dark:text-neutral-300">
                {location && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-neutral-400" />
                    {location}
                  </p>
                )}

                {isInvite && isHost && (
                  <p className="flex items-center gap-1.5 font-medium text-fuchsia-600 dark:text-fuchsia-400">
                    <Crown className="h-4 w-4" /> You&rsquo;re hosting
                  </p>
                )}
                {isInvite && isGuest && (
                  <p className="text-neutral-500 dark:text-neutral-400">
                    Hosted by {card.hostName ?? card.senderName}
                    <span className="ml-1 text-neutral-400 dark:text-neutral-500">· only they can edit</span>
                  </p>
                )}
                {isInvite && !hostId && (
                  <p className="text-neutral-500 dark:text-neutral-400">Invited by {card.senderName}</p>
                )}
                {isInvite && card.note && !isRedundantNote(card.note, { time: timeLabel, location }) && (
                  <p className="italic text-neutral-500 dark:text-neutral-400">{card.note}</p>
                )}
                {isInvite && card.summary && (
                  <p className="text-neutral-600 dark:text-neutral-300">{card.summary}</p>
                )}

                {isRadar && card.details && !isRedundantNote(card.details, { time: timeLabel, location }) && (
                  <p>{card.details}</p>
                )}
                {isWindow && <p className="text-neutral-600 dark:text-neutral-300">{card.summary}</p>}

                {isInvite && inviteCountdown && inviteCountdown.label && (
                  <p className="font-medium text-amber-600 dark:text-amber-400">{inviteCountdown.label}</p>
                )}

                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-amber-600 hover:underline dark:text-amber-400"
                  >
                    {isWindow ? card.actionLabel : "Read original"}
                    <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </a>
                )}
              </div>

              {(canPromote || canReinvite || canEdit) && (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {(canPromote || canReinvite) && (
                      <button
                        type="button"
                        onClick={() => setInviting(true)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-fuchsia-500"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {canPromote ? "Invite friends" : "Invite more friends"}
                      </button>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      aria-label="Edit"
                      className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {inviting && (
        <InviteComposer
          eventTitle={title}
          target={inviteTarget}
          canSetReinvite={canPromote || isHost}
          initialAllowReinvite={allowReinvite}
          onClose={() => setInviting(false)}
        />
      )}
    </div>
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

    if (mode === "host" && eventId) {
      const res = await updateHostEvent({
        eventId,
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
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="optional"
          className={field}
        />
      </label>

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
