"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  X,
  Check,
  MapPin,
  Link2,
  Bookmark,
  CalendarDays,
  CalendarPlus,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { CARD_TYPES, initials } from "@/lib/cardTypes";
import type { DigestCardData, CardStatus } from "@/lib/types";
import { eventDateLabel } from "@/lib/dateLabel";
import { addScoutedToCalendar } from "@/app/deck-actions";
import { clientTimeZone, isoFromLocal, localFromIso } from "@/lib/localDateTime";
import {
  busyFromCard,
  findConflict,
  formatBusyRange,
  DEFAULT_BLOCK_MIN,
  type BusyInterval,
} from "@/lib/conflicts";
import { DateTimeField, type DTValue } from "./DateTimeField";
import { PhotoGallery } from "./PhotoGallery";
import { RichText } from "./RichText";

/** Terminal statuses a card can resolve to from the deck. */
export type ResolveStatus = Extract<CardStatus, "saved" | "dismissed" | "accepted">;

interface DigestCardProps {
  card: DigestCardData;
  onResolve: (id: string, status: ResolveStatus) => void;
  /** The user's accepted calendar blocks, for the conflict check. */
  busy?: BusyInterval[];
}

/* --------------------------------- shell ---------------------------------- */

export function DigestCard({ card, onResolve, busy = [] }: DigestCardProps) {
  const rail =
    card.type === "news_scout"
      ? (CATEGORIES[card.category]?.railClass ?? "bg-neutral-300 dark:bg-neutral-700")
      : (CARD_TYPES[card.type]?.railClass ?? "bg-neutral-300 dark:bg-neutral-700");

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        height: 0,
        marginTop: 0,
        marginBottom: 0,
        scale: 0.96,
        transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
      }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="group relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm ring-1 ring-black/[0.02] transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${rail}`} aria-hidden />
      <div className="p-5 pl-6">
        <CardHeader card={card} onResolve={onResolve} />
        <CardBody card={card} />
        <ConflictLine card={card} busy={busy} />
        <div className="mt-4">
          <CardActions card={card} onResolve={onResolve} />
        </div>
      </div>
    </motion.article>
  );
}

/* -------------------------------- header ---------------------------------- */

function Chip({
  icon: Icon,
  text,
  className,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  text: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {text}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-[0.65rem] font-semibold text-white dark:bg-white dark:text-neutral-900">
      {initials(name)}
    </span>
  );
}

/** The Save (bookmark) button — only friends' posts are savable to the Library. */
function SaveButton({ onSave }: { onSave: () => void }) {
  return (
    <button
      type="button"
      onClick={onSave}
      aria-label="Save to Library"
      title="Save to Library"
      className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-amber-50 hover:text-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 dark:hover:bg-amber-500/10 dark:hover:text-amber-400"
    >
      <Bookmark className="h-[1.15rem] w-[1.15rem]" strokeWidth={2} />
    </button>
  );
}

const TIME_PHRASES: [string, string][] = [
  ["after midnight", "After midnight"],
  ["pre-dawn", "Pre-dawn"],
  ["before dawn", "Before dawn"],
  ["at sunset", "Sunset"],
  ["sunset", "Sunset"],
  ["at sunrise", "Sunrise"],
  ["sunrise", "Sunrise"],
  ["at dusk", "Dusk"],
  ["golden hour", "Golden hour"],
  ["overnight", "Overnight"],
  ["all day", "All day"],
  ["this weekend", "This weekend"],
  ["weekends", "Weekends"],
  ["weekend", "This weekend"],
  ["evenings", "Evenings"],
  ["evening", "Evening"],
  ["mornings", "Mornings"],
  ["morning", "Morning"],
  ["afternoons", "Afternoons"],
  ["afternoon", "Afternoon"],
  ["nightly", "Nightly"],
  ["nights", "Nights"],
];

/**
 * Best-effort, zero-cost guess of a time-of-day or time RANGE from free text,
 * used to enrich an undated card's top line (e.g. "10am–4pm", "8pm", "Evenings").
 * Returns "" if nothing confident.
 */
function guessTimeHint(text: string): string {
  const t = text.toLowerCase();

  // A range like "10am-4pm" / "7–9 pm".
  let m = t.match(/\b(\d{1,2}(?::\d{2})?)\s?(am|pm)?\s?(?:–|—|-|to)\s?(\d{1,2}(?::\d{2})?)\s?(am|pm)\b/);
  if (m) {
    const clean = (n: string, ap?: string) => `${n}${ap ?? ""}`.replace(/:00/g, "");
    return `${clean(m[1], m[2] ?? m[4])}–${clean(m[3], m[4])}`;
  }

  // A single time like "8pm" / "8:30 pm".
  m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/);
  if (m) {
    const min = m[2] && m[2] !== "00" ? `:${m[2]}` : "";
    return `${m[1]}${min}${m[3]}`;
  }

  for (const [needle, label] of TIME_PHRASES) if (t.includes(needle)) return label;
  return "";
}

/**
 * The top-of-card time line for a scouted card. ONE clean time/date, shown once:
 * a recurring window label ("Wednesdays, 7–10:30pm"), else the concrete date,
 * else a best-effort guess from the text. No topic tag, no countdown.
 */
function DateLine({
  card,
}: {
  card: Extract<DigestCardData, { type: "news_scout" | "time_window" }>;
}) {
  const isWindow = card.type === "time_window";
  const windowLabel = isWindow ? card.windowLabel?.trim() ?? "" : "";
  const dateText = isWindow ? eventDateLabel(card.opensAt, card.expiresAt) : "";

  let when = windowLabel || dateText;
  if (!when) {
    const g = guessDateTime(`${card.title}. ${card.summary}`);
    when = g ? formatGuess(g) : guessTimeHint(card.summary);
  }
  if (!when) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 ring-1 ring-inset ring-neutral-200/70 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700/70">
      <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
      {when}
    </span>
  );
}

/** Resolve the pending card's own busy interval (needs a concrete clock time). */
function selfInterval(
  card: DigestCardData,
  tz: string,
): { startMs: number; endMs: number } | null {
  const b = busyFromCard(card);
  if (b) return { startMs: b.startMs, endMs: b.endMs };
  if (card.type === "news_scout") {
    const g = guessDateTime(`${card.title}. ${card.summary}`);
    if (g && g.time) {
      const iso = isoFromLocal(g.date, g.time, tz);
      const s = iso ? Date.parse(iso) : NaN;
      if (!Number.isNaN(s)) return { startMs: s, endMs: s + DEFAULT_BLOCK_MIN * 60_000 };
    }
  }
  return null;
}

/**
 * "No conflict" / "Conflict with <event> · <time>" for a timed Today card,
 * checked against the calendar the user has already accepted. Renders nothing
 * for cards with no concrete clock time (nothing to compare against).
 */
function ConflictLine({ card, busy }: { card: DigestCardData; busy: BusyInterval[] }) {
  const tz = clientTimeZone();
  const self = selfInterval(card, tz);
  if (!self) return null;

  const hit = findConflict(self.startMs, self.endMs, busy);
  return (
    <div className="mt-3">
      {hit ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
          Conflict with {hit.title} · {formatBusyRange(hit, tz)}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
          No conflict
        </span>
      )}
    </div>
  );
}

function CardHeader({
  card,
  onResolve,
}: {
  card: DigestCardData;
  onResolve: (id: string, status: ResolveStatus) => void;
}) {
  // Scouted cards: date/topic on top-left, nothing on the right (not savable).
  if (card.type === "news_scout" || card.type === "time_window") {
    return (
      <div className="mb-3 flex items-center justify-between gap-2">
        <DateLine card={card} />
      </div>
    );
  }

  if (card.type === "event_update") {
    const upd = CARD_TYPES.event_update;
    return (
      <div className="mb-3 flex items-center justify-between gap-2">
        <Chip icon={upd.icon} text={upd.label} className={upd.chipClass} />
        <span className="text-xs text-neutral-500 dark:text-neutral-400">from {card.hostName}</span>
      </div>
    );
  }

  const meta = CARD_TYPES[card.type];
  if (!meta) return null;

  const isSocial =
    card.type === "social_ping" ||
    card.type === "social_invite" ||
    card.type === "social_post";

  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <Chip icon={meta.icon} text={meta.label} className={meta.chipClass} />
      <div className="flex items-center gap-2">
        {isSocial && (
          <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <Avatar name={card.senderName} />
            {card.senderName}
          </span>
        )}
        {/* Save only exists on friends' posts. */}
        {card.type === "social_post" && (
          <SaveButton onSave={() => onResolve(card.id, "saved")} />
        )}
      </div>
    </div>
  );
}

/* --------------------------------- body ----------------------------------- */

function CardBody({ card }: { card: DigestCardData }) {
  switch (card.type) {
    case "news_scout":
      return (
        <>
          <h2 className="text-[1.05rem] font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
            {card.actionUrl ? (
              <a
                href={card.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {card.title}
              </a>
            ) : (
              card.title
            )}
          </h2>
          <RichText
            text={card.summary}
            className="mt-2 text-[0.925rem] leading-relaxed text-neutral-600 dark:text-neutral-300"
          />
        </>
      );

    case "time_window":
      return (
        <>
          <h2 className="text-[1.05rem] font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
            {card.actionUrl ? (
              <a
                href={card.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {card.title}
              </a>
            ) : (
              card.title
            )}
          </h2>
          <RichText
            text={card.summary}
            className="mt-2 text-[0.925rem] leading-relaxed text-neutral-600 dark:text-neutral-300"
          />
        </>
      );

    case "social_ping":
      return (
        <>
          <RichText
            text={card.message}
            className="text-[0.975rem] leading-relaxed text-neutral-800 dark:text-neutral-100"
          />
          {card.link && (
            <a
              href={card.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <Link2 className="h-3.5 w-3.5" />
              {safeHostname(card.link)}
            </a>
          )}
        </>
      );

    case "social_invite":
      return (
        <>
          <h2 className="text-[1.05rem] font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
            {card.eventTitle}
          </h2>
          <div className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
            <p className="font-medium text-neutral-700 dark:text-neutral-200">{card.eventTime}</p>
            {card.location && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                {card.location}
              </p>
            )}
            {card.note && <RichText text={card.note} className="pt-1 leading-relaxed" />}
            {card.sourceUrl && (
              <a
                href={card.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-fuchsia-600 hover:underline dark:text-fuchsia-400"
              >
                <Link2 className="h-3.5 w-3.5" />
                Original details
              </a>
            )}
          </div>
        </>
      );

    case "calendar_radar":
      return (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[1.05rem] font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
              {card.title}
            </h2>
            <span className="shrink-0 text-sm font-medium text-sky-600 dark:text-sky-400">
              {card.time}
            </span>
          </div>
          <div className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
            {card.location && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                {card.location}
              </p>
            )}
            {card.details && <p className="leading-relaxed">{card.details}</p>}
          </div>
        </>
      );

    case "event_update":
      return (
        <>
          <h2 className="text-[1.05rem] font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
            {card.eventTitle}
          </h2>
          <p className="mt-2 text-[0.925rem] leading-relaxed text-neutral-600 dark:text-neutral-300">
            <span className="font-medium text-neutral-700 dark:text-neutral-200">{card.hostName}</span>{" "}
            updated the plan.
          </p>
          <div className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
            {card.eventTime && (
              <p className="font-medium text-neutral-700 dark:text-neutral-200">{card.eventTime}</p>
            )}
            {card.location && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                {card.location}
              </p>
            )}
          </div>
        </>
      );

    case "social_post":
      return (
        <>
          {card.eventTitle && (
            <p className="mb-2 text-xs text-neutral-400 dark:text-neutral-500">
              shared to <span className="font-medium">{card.eventTitle}</span>
            </p>
          )}
          {card.imageUrls.length > 0 && (
            <PhotoGallery images={card.imageUrls} alt={card.caption ?? "Post image"} />
          )}
          {card.caption && (
            <RichText
              text={card.caption}
              className="mt-2 text-[0.95rem] leading-relaxed text-neutral-800 dark:text-neutral-100"
            />
          )}
        </>
      );
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "link";
  }
}

/* -------------------------------- actions --------------------------------- */

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      {children}
    </button>
  );
}

function GhostButton({
  onClick,
  label,
  icon: Icon = X,
}: {
  onClick: () => void;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      <Icon className="h-4 w-4" strokeWidth={2.25} />
      {label}
    </button>
  );
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function isoHasClock(iso?: string): boolean {
  if (!iso) return false;
  const s = String(iso).trim();
  return !DATE_ONLY.test(s) && /T\d{2}:\d{2}/.test(s);
}

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/**
 * Best-effort, ZERO-COST client-side parse of a date/time out of free text
 * (title + summary), used only to PREFILL the picker when the scout didn't
 * already provide a structured date. Handles "August 11", "Aug 11 at 8pm",
 * "8pm on Aug 11", "11 August", "8:30 PM". Returns null if nothing confident.
 */
function guessDateTime(text: string): DTValue | null {
  const t = text.toLowerCase();
  let mo = -1;
  let day = -1;

  let m = t.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (m) {
    mo = MONTH_KEYS.indexOf(m[1].slice(0, 3));
    day = parseInt(m[2], 10);
  } else {
    m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\b`));
    if (m) {
      day = parseInt(m[1], 10);
      mo = MONTH_KEYS.indexOf(m[2].slice(0, 3));
    }
  }
  if (mo < 0 || day < 1 || day > 31) return null;

  // Optional time: "8pm", "8:30 pm", "20:00".
  let time: string | null = null;
  const tm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (tm) {
    let h = parseInt(tm[1], 10) % 12;
    if (tm[3] === "pm") h += 12;
    time = `${String(h).padStart(2, "0")}:${tm[2] ?? "00"}`;
  } else {
    const t24 = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (t24) time = `${t24[1].padStart(2, "0")}:${t24[2]}`;
  }

  // Year: explicit if present, else the next occurrence (allow ~2 months slack).
  const ym = t.match(/\b(20\d{2})\b/);
  let year = ym ? parseInt(ym[1], 10) : new Date().getFullYear();
  if (!ym) {
    const candidate = new Date(year, mo, day).getTime();
    if (candidate < Date.now() - 60 * 86_400_000) year += 1;
  }

  const date = `${year}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date, time };
}

/** Format a guessed {date,time} for display (no weekday — it's a guess, and
 *  dropping it keeps SSR/client output identical). "Aug 11" / "Aug 11 · 8:00 PM". */
function formatGuess(g: DTValue): string {
  const [y, mo, d] = g.date.split("-").map(Number);
  if (!y || !mo || !d) return "";
  const dateObj = new Date(Date.UTC(y, mo - 1, d, 12));
  const datePart = dateObj.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  if (!g.time) return datePart;
  const [hh, mm] = g.time.split(":").map(Number);
  const timeObj = new Date(Date.UTC(2000, 0, 1, hh || 0, mm || 0));
  const timePart = timeObj.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}

/** The picker's initial value: structured scout date → text guess → today. */
function initialPickerValue(
  card: Extract<DigestCardData, { type: "news_scout" | "time_window" }>,
): DTValue {
  const tz = clientTimeZone();

  if (card.type === "time_window") {
    const iso = card.opensAt ?? card.expiresAt;
    if (iso && !Number.isNaN(Date.parse(iso))) {
      const loc = localFromIso(iso, tz);
      if (loc) return { date: loc.date, time: isoHasClock(iso) ? loc.time : null };
    }
  }

  const guess = guessDateTime(`${card.title}. ${card.summary}`);
  if (guess) return guess;

  const today = localFromIso(new Date().toISOString(), tz)?.date ?? "";
  return { date: today, time: null };
}

/**
 * Add-to-Calendar (secondary action) for a scouted card. Opens an inline date
 * picker prefilled with the event's known date/time (or a best guess from the
 * text). Confirming makes the card an owned, editable personal event and it
 * leaves the deck.
 */
function AddToCalendar({
  card,
  onAdded,
}: {
  card: Extract<DigestCardData, { type: "news_scout" | "time_window" }>;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<DTValue>({ date: "", time: null });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <SecondaryButton
        onClick={() => {
          setValue(initialPickerValue(card));
          setError(null);
          setOpen(true);
        }}
      >
        <CalendarPlus className="h-4 w-4" strokeWidth={2.25} />
        Add to Calendar
      </SecondaryButton>
    );
  }

  return (
    <div className="w-full space-y-2">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">Add to your calendar:</p>
      <DateTimeField value={value} onChange={setValue} />
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex items-center gap-2">
        <PrimaryButton
          disabled={pending}
          onClick={async () => {
            if (!value.date) {
              setError("Pick a date.");
              return;
            }
            const iso = isoFromLocal(value.date, value.time, clientTimeZone());
            if (!iso) {
              setError("Pick a valid date.");
              return;
            }
            setPending(true);
            setError(null);
            const r = await addScoutedToCalendar({ id: card.id, startsAt: iso, hasTime: value.time !== null });
            if (r.ok) {
              onAdded();
              return;
            }
            setPending(false);
            setError(r.error ?? "Couldn't add that.");
          }}
        >
          {pending ? "Adding…" : "Add"}
        </PrimaryButton>
        <GhostButton onClick={() => setOpen(false)} label="Cancel" />
      </div>
    </div>
  );
}

const REACTIONS = ["👍", "❤️", "🎉"];

function CardActions({
  card,
  onResolve,
}: {
  card: DigestCardData;
  onResolve: (id: string, status: ResolveStatus) => void;
}) {
  const dismiss = (
    <GhostButton onClick={() => onResolve(card.id, "dismissed")} label="Dismiss" />
  );

  switch (card.type) {
    case "social_ping":
      return (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {REACTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onResolve(card.id, "saved")}
                aria-label={`React ${r} and save`}
                className="rounded-full border border-neutral-200 px-2.5 py-1.5 text-base leading-none transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {r}
              </button>
            ))}
          </div>
          <div className="ml-auto">{dismiss}</div>
        </div>
      );

    case "social_invite":
      return (
        <div className="flex items-center gap-2">
          <PrimaryButton onClick={() => onResolve(card.id, "accepted")}>
            <Check className="h-4 w-4" strokeWidth={2.25} />
            Going
          </PrimaryButton>
          <GhostButton onClick={() => onResolve(card.id, "dismissed")} label="Can't make it" />
        </div>
      );

    // Scouted cards: the source link is the primary action; Add to Calendar is
    // the secondary option (opens a prefilled date picker).
    case "news_scout":
    case "time_window": {
      const url = card.actionUrl;
      return (
        <div className="flex flex-wrap items-center gap-2">
          {url ? (
            <PrimaryButton onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
              {card.actionLabel}
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
            </PrimaryButton>
          ) : null}
          <AddToCalendar card={card} onAdded={() => onResolve(card.id, "accepted")} />
          <div className="ml-auto">{dismiss}</div>
        </div>
      );
    }

    case "calendar_radar":
      return (
        <div className="flex items-center gap-2">
          <PrimaryButton onClick={() => onResolve(card.id, "accepted")}>
            Add to Calendar
          </PrimaryButton>
          {dismiss}
        </div>
      );

    case "event_update":
      return (
        <div className="flex items-center gap-2">
          <GhostButton onClick={() => onResolve(card.id, "dismissed")} label="Got it" icon={Check} />
        </div>
      );

    case "social_post":
      return <div className="flex items-center gap-2">{dismiss}</div>;
  }
}
