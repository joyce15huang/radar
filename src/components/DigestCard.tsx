"use client";

import { useState } from "react";
import { ArrowUpRight, Check, MapPin, Link2, CalendarDays, CalendarPlus, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { initials } from "@/lib/cardTypes";
import type { DigestCardData, CardStatus } from "@/lib/types";
import { eventDateLabel } from "@/lib/dateLabel";
import { addScoutedToCalendar } from "@/app/deck-actions";
import { setFeePaid } from "@/app/event-actions";
import { clientTimeZone, isoFromLocal, localFromIso } from "@/lib/localDateTime";
import { busyFromCard, findConflict, formatBusyRange, type BusyInterval } from "@/lib/conflicts";
import { DateTimeField, type DTValue } from "./DateTimeField";
import { PhotoGallery } from "./PhotoGallery";
import { RichText } from "./RichText";
import { cardVisual } from "./cardVisual";

/** Terminal statuses a card can resolve to from the deck. */
export type ResolveStatus = Extract<CardStatus, "saved" | "dismissed" | "accepted">;

type Scouted = Extract<DigestCardData, { type: "news_scout" | "time_window" }>;
type Invite = Extract<DigestCardData, { type: "social_invite" }>;

interface DigestCardProps {
  card: DigestCardData;
  onResolve: (id: string, status: ResolveStatus) => void;
  /** Stretch to the available height (Today deck): the hero absorbs the extra space. */
  fill?: boolean;
  /** The user's accepted calendar blocks, for the conflict check. */
  busy?: BusyInterval[];
}

/** Keeps a nested gesture (photo scroll, date picker) from dragging the card. */
const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

/* --------------------------------- shell ---------------------------------- */

/**
 * One deck card: an optional sender line, a tinted hero (or the photos of a
 * friend's post), a date tile + title + one-line hook, and quiet icon actions.
 * Skip / save / RSVP live on the deck (swipe + the buttons under the card).
 */
export function DigestCard({ card, onResolve, busy = [], fill = false }: DigestCardProps) {
  return (
    <article
      className={`overflow-hidden rounded-[28px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(24,24,27,0.08)] ${
        fill ? "flex flex-1 flex-col" : ""
      }`}
    >
      <SenderStrip card={card} />
      <Hero card={card} fill={fill} />
      <div className="p-5">
        <MainRow card={card} />
        <Extras card={card} busy={busy} />
        <Footer card={card} onResolve={onResolve} />
      </div>
    </article>
  );
}

/* ------------------------------ sender strip ------------------------------ */

function senderLine(card: DigestCardData): { name: string; verb: string } | null {
  switch (card.type) {
    case "social_invite":
      return { name: card.senderName, verb: "invited you" };
    case "social_post":
      return { name: card.senderName, verb: card.eventTitle ? `shared photos from ${card.eventTitle}` : "shared a post" };
    case "social_ping":
      return { name: card.senderName, verb: "sent you a note" };
    case "time_poll":
      return { name: card.senderName, verb: "is finding a time" };
    case "event_update":
      return { name: card.hostName, verb: "updated the plan" };
    case "broadcast_bundle":
      return { name: card.senderName, verb: `posted ${card.count} events` };
    default:
      return null;
  }
}

function SenderStrip({ card }: { card: DigestCardData }) {
  const s = senderLine(card);
  if (!s) return null;
  return (
    <div className="flex items-center gap-2.5 border-b border-neutral-100 px-5 py-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
        {initials(s.name)}
      </span>
      <p className="min-w-0 truncate text-sm text-neutral-600">
        <span className="font-semibold text-neutral-900">{s.name}</span> {s.verb}
      </p>
    </div>
  );
}

/* ---------------------------------- hero ---------------------------------- */

function Hero({ card, fill = false }: { card: DigestCardData; fill?: boolean }) {
  if (card.type === "social_post" && card.imageUrls.length > 0) {
    return (
      <div className={`px-3 pt-3 ${fill ? "flex flex-1 items-center" : ""}`} onPointerDown={stopDrag}>
        <PhotoGallery images={card.imageUrls} alt={card.caption ?? "Post photo"} />
      </div>
    );
  }
  const v = cardVisual(card);
  const Icon = v.icon;
  const pill = (card.type === "news_scout" || card.type === "time_window") && card.topic ? card.topic : v.label;
  return (
    <div className={`relative flex items-center justify-center ${fill ? "min-h-[140px] flex-1" : "h-40"} ${v.bg}`}>
      <span className={`absolute left-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold ${v.pill}`}>
        {pill}
      </span>
      <Icon className={`${fill ? "h-20 w-20" : "h-16 w-16"} ${v.fg}`} strokeWidth={1.3} aria-hidden />
    </div>
  );
}

/* -------------------------------- main row -------------------------------- */

interface Tile {
  top: string;
  day: string;
  time: string | null;
}

/** Date-tile data for an ISO time, in the viewer's timezone. Weekday when the
 *  date is within the coming week, otherwise the month. */
function tileFor(iso: string | undefined | null, fallbackTime?: string | null): Tile | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  const loc = localFromIso(iso, clientTimeZone());
  if (!loc?.date) return null;
  const [y, m, d] = loc.date.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  const days = (noon.getTime() - Date.now()) / 86_400_000;
  const top =
    days > -1 && days < 6.5
      ? noon.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
      : noon.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  let time: string | null = null;
  if (isoHasClock(iso) && loc.time) {
    const [hh, mm] = loc.time.split(":").map(Number);
    time = `${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "AM" : "PM"}`;
  } else if (fallbackTime && fallbackTime.length <= 12) {
    time = fallbackTime;
  }
  return { top: top.toUpperCase(), day: String(d), time };
}

function cardTile(card: DigestCardData): Tile | null {
  switch (card.type) {
    case "time_window":
      return tileFor(card.opensAt ?? card.expiresAt, card.windowLabel);
    case "social_invite":
      return tileFor(card.startsAt);
    case "calendar_radar":
      return tileFor(card.startsAt);
    default:
      return null;
  }
}

/** A text "when" for cards without a clean date tile. */
function whenText(card: DigestCardData): string | null {
  switch (card.type) {
    case "time_window": {
      const w = card.windowLabel?.trim() || eventDateLabel(card.opensAt, card.expiresAt);
      if (w) return w;
      return guessedWhen(card);
    }
    case "news_scout":
      return guessedWhen(card);
    case "social_invite":
      return card.eventTime || null;
    case "calendar_radar":
      return card.time || null;
    case "event_update":
      return card.eventTime || null;
    default:
      return null;
  }
}

function guessedWhen(card: Scouted): string | null {
  const g = guessDateTime(`${card.title}. ${card.summary}`);
  return (g ? formatGuess(g) : guessTimeHint(card.summary)) || null;
}

function cardTitle(card: DigestCardData): string | null {
  switch (card.type) {
    case "news_scout":
    case "time_window":
    case "calendar_radar":
    case "time_poll":
      return card.title;
    case "social_invite":
    case "event_update":
      return card.eventTitle;
    case "broadcast_bundle":
      return `${card.count} upcoming events`;
    default:
      return null;
  }
}

function Hook({ card }: { card: DigestCardData }) {
  const muted = "text-[15px] leading-snug text-neutral-600";
  switch (card.type) {
    case "news_scout":
    case "time_window":
      // Where + what it costs beats a summary sentence; fall back to the hook.
      if (card.place || card.cost) {
        return (
          <ul className="space-y-1.5 pt-0.5">
            {card.place && (
              <li className="flex items-center gap-2 text-[14px] font-semibold text-neutral-900">
                <MapPin className="h-4 w-4 shrink-0 text-neutral-500" strokeWidth={2} />
                <span className="truncate">{card.place}</span>
              </li>
            )}
            {card.cost && (
              <li className="flex items-center gap-2 text-[14px] font-semibold text-neutral-900">
                <Ticket className="h-4 w-4 shrink-0 text-neutral-500" strokeWidth={2} />
                <span className="truncate">{card.cost}</span>
              </li>
            )}
          </ul>
        );
      }
      return <RichText text={card.summary} className={`line-clamp-2 ${muted}`} />;
    case "social_invite":
      return card.note ? <RichText text={card.note} className={`line-clamp-2 ${muted}`} /> : null;
    case "calendar_radar":
      return card.details ? <p className={`line-clamp-2 ${muted}`}>{card.details}</p> : null;
    case "time_poll":
      return (
        <p className={muted}>
          {card.optionCount ? `${card.optionCount} option${card.optionCount === 1 ? "" : "s"} — ` : ""}mark when you&rsquo;re free.
        </p>
      );
    case "broadcast_bundle":
      return (
        <ul className="space-y-1">
          {card.titles.slice(0, 3).map((t, i) => (
            <li key={i} className={`truncate ${muted}`}>
              {t}
            </li>
          ))}
          {card.titles.length > 3 && <li className="text-[13px] text-neutral-500">+{card.titles.length - 3} more</li>}
        </ul>
      );
    case "social_ping":
      return (
        <div className="space-y-2">
          <RichText text={card.message} className="text-[17px] leading-relaxed text-neutral-800" />
          {card.link && (
            <a
              href={card.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-fuchsia-700 hover:underline"
            >
              <Link2 className="h-3.5 w-3.5" />
              {safeHostname(card.link)}
            </a>
          )}
        </div>
      );
    case "social_post":
      return card.caption ? (
        <RichText text={card.caption} className="line-clamp-3 text-[15px] leading-relaxed text-neutral-800" />
      ) : null;
    default:
      return null;
  }
}

function MainRow({ card }: { card: DigestCardData }) {
  const tile = cardTile(card);
  const when = tile ? null : whenText(card);
  const title = cardTitle(card);
  return (
    <div className="flex items-start gap-4">
      {tile && <DateTile tile={tile} />}
      <div className="min-w-0 flex-1 space-y-1.5">
        {when && (
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-500">
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
            {when}
          </p>
        )}
        {title && <h2 className="text-xl font-semibold leading-tight tracking-tight text-neutral-900">{title}</h2>}
        <Hook card={card} />
      </div>
    </div>
  );
}

function DateTile({ tile }: { tile: Tile }) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center rounded-2xl bg-neutral-100 py-2">
      <span className="text-[11px] font-semibold tracking-wider text-neutral-600">{tile.top}</span>
      <span className="text-2xl font-bold leading-tight text-neutral-900">{tile.day}</span>
      {tile.time && <span className="px-1 text-center text-[11px] font-medium leading-tight text-neutral-600">{tile.time}</span>}
    </div>
  );
}

/* --------------------------------- extras --------------------------------- */

function MetaLine({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-neutral-600">
      <Icon className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={2} />
      <span className="truncate">{text}</span>
    </p>
  );
}

function Extras({ card, busy }: { card: DigestCardData; busy: BusyInterval[] }) {
  if (card.type === "social_invite") {
    const conflict = conflictMeta(card, busy, clientTimeZone());
    if (!card.location && !conflict && !(card.fee && card.fee > 0)) return null;
    return (
      <div className="mt-4 space-y-2.5">
        {card.location && <MetaLine icon={MapPin} text={card.location} />}
        {conflict && (
          <p className={`text-[13px] ${conflict.conflict ? "font-medium text-amber-700" : "text-neutral-500"}`}>
            {conflict.text}
          </p>
        )}
        <FeeRow card={card} />
      </div>
    );
  }
  if ((card.type === "calendar_radar" || card.type === "event_update") && card.location) {
    return (
      <div className="mt-4">
        <MetaLine icon={MapPin} text={card.location} />
      </div>
    );
  }
  return null;
}

/**
 * Conflict status for an invite — "No conflict" or "Conflict with <event> ·
 * <time>" — against the user's accepted calendar. Null unless the card carries
 * a concrete start time (never guessed from prose).
 */
function conflictMeta(
  card: DigestCardData,
  busy: BusyInterval[],
  tz: string,
): { text: string; conflict: boolean } | null {
  const self = busyFromCard(card);
  if (!self) return null;
  const hit = findConflict(self.startMs, self.endMs, busy);
  if (hit) return { text: `Conflict with ${hit.title} · ${formatBusyRange(hit, tz)}`, conflict: true };
  return { text: "No conflict", conflict: false };
}

/** Integer cents → "$40" / "$16.67". */
function money(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** The invite's fee: amount, a Pay deep-link, and a manual "Mark paid" tap.
 *  No real money moves — the tap records the attendee's own confirmation. */
function FeeRow({ card }: { card: Invite }) {
  const [paid, setPaid] = useState(!!card.feePaid);
  const [pending, setPending] = useState(false);

  if (!card.fee || card.fee <= 0) return null;

  const venmoHref = card.venmoId
    ? `https://venmo.com/${card.venmoId}?txn=pay&amount=${(card.fee / 100).toFixed(2)}`
    : null;
  const linkHref = card.paymentLink
    ? /^https?:\/\//i.test(card.paymentLink)
      ? card.paymentLink
      : `https://${card.paymentLink}`
    : null;
  const payHref = venmoHref ?? linkHref;

  async function toggle() {
    if (pending) return;
    const next = !paid;
    setPaid(next);
    setPending(true);
    const res = await setFeePaid(card.id, next);
    setPending(false);
    if (!res.ok) setPaid(!next);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-neutral-50 px-3.5 py-3">
      <span className="text-sm font-semibold text-neutral-900">{money(card.fee)} to join</span>
      {payHref && (
        <a
          href={payHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-fuchsia-700 hover:underline"
        >
          {venmoHref ? "Pay on Venmo" : "Pay"}
        </a>
      )}
      {card.zelleId && <span className="text-xs text-neutral-500">Zelle {card.zelleId}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`ml-auto inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 text-xs font-semibold transition disabled:opacity-60 ${
          paid ? "bg-emerald-50 text-emerald-700" : "bg-neutral-900 text-white hover:bg-neutral-700"
        }`}
      >
        {paid ? (
          <>
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Paid
          </>
        ) : (
          "Mark paid"
        )}
      </button>
    </div>
  );
}

/* --------------------------------- footer --------------------------------- */

function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
        pressed
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {children}
    </button>
  );
}

function Footer({ card, onResolve }: { card: DigestCardData; onResolve: (id: string, s: ResolveStatus) => void }) {
  if (card.type === "news_scout" || card.type === "time_window") {
    return <ScoutFooter card={card} onAdded={() => onResolve(card.id, "accepted")} />;
  }
  if (card.type === "social_invite" && card.sourceUrl) {
    return (
      <a
        href={card.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-600 hover:text-neutral-900"
      >
        <Link2 className="h-3.5 w-3.5" /> Original details
      </a>
    );
  }
  return null;
}

function ScoutFooter({ card, onAdded }: { card: Scouted; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const url = card.actionUrl;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[13px] text-neutral-500">{url ? safeHostname(url) : ""}</span>
        <div className="flex shrink-0 gap-2">
          {url && (
            <IconButton label={card.actionLabel || "Open source"} onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
              <ArrowUpRight className="h-[18px] w-[18px]" strokeWidth={2} />
            </IconButton>
          )}
          <IconButton label="Add to calendar" pressed={open} onClick={() => setOpen((o) => !o)}>
            <CalendarPlus className="h-[18px] w-[18px]" strokeWidth={2} />
          </IconButton>
        </div>
      </div>
      {open && <CalendarPicker card={card} onAdded={onAdded} onCancel={() => setOpen(false)} />}
    </div>
  );
}

/** Inline picker, prefilled from the scouted date (or a best guess). Confirming
 *  turns the card into an owned, editable personal event. */
function CalendarPicker({ card, onAdded, onCancel }: { card: Scouted; onAdded: () => void; onCancel: () => void }) {
  const [value, setValue] = useState<DTValue>(() => initialPickerValue(card));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!value.date) return setError("Pick a date.");
    const iso = isoFromLocal(value.date, value.time, clientTimeZone());
    if (!iso) return setError("Pick a valid date.");
    setPending(true);
    setError(null);
    const r = await addScoutedToCalendar({ id: card.id, startsAt: iso, hasTime: value.time !== null });
    if (r.ok) return onAdded();
    setPending(false);
    setError(r.error ?? "Couldn't add that.");
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-2xl bg-neutral-50 p-3" onPointerDown={stopDrag}>
      <p className="text-xs font-medium text-neutral-500">Add to your calendar</p>
      <DateTimeField value={value} onChange={setValue} />
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="min-h-[40px] rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[40px] rounded-full px-4 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- helpers -------------------------------- */

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "link";
  }
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

/** Best-effort time-of-day or range from free text ("10am–4pm", "8pm",
 *  "Evenings"). "" if nothing confident. */
function guessTimeHint(text: string): string {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d{1,2}(?::\d{2})?)\s?(am|pm)?\s?(?:–|—|-|to)\s?(\d{1,2}(?::\d{2})?)\s?(am|pm)\b/);
  if (m) {
    const clean = (n: string, ap?: string) => `${n}${ap ?? ""}`.replace(/:00/g, "");
    return `${clean(m[1], m[2] ?? m[4])}–${clean(m[3], m[4])}`;
  }
  m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/);
  if (m) {
    const min = m[2] && m[2] !== "00" ? `:${m[2]}` : "";
    return `${m[1]}${min}${m[3]}`;
  }
  for (const [needle, label] of TIME_PHRASES) if (t.includes(needle)) return label;
  return "";
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function isoHasClock(iso?: string | null): boolean {
  if (!iso) return false;
  const s = String(iso).trim();
  return !DATE_ONLY.test(s) && /T\d{2}:\d{2}/.test(s);
}

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/** Zero-cost parse of a date/time from free text, used only to prefill the
 *  picker or label an undated card. Null if nothing confident. */
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

  const ym = t.match(/\b(20\d{2})\b/);
  let year = ym ? parseInt(ym[1], 10) : new Date().getFullYear();
  if (!ym) {
    const candidate = new Date(year, mo, day).getTime();
    if (candidate < Date.now() - 60 * 86_400_000) year += 1;
  }
  const date = `${year}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date, time };
}

/** "Aug 11" / "Aug 11 · 8:00 PM" for a guessed date. */
function formatGuess(g: DTValue): string {
  const [y, mo, d] = g.date.split("-").map(Number);
  if (!y || !mo || !d) return "";
  const datePart = new Date(Date.UTC(y, mo - 1, d, 12)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  if (!g.time) return datePart;
  const [hh, mm] = g.time.split(":").map(Number);
  const timePart = new Date(Date.UTC(2000, 0, 1, hh || 0, mm || 0)).toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}

/** The picker's initial value: structured scout date → text guess → today. */
function initialPickerValue(card: Scouted): DTValue {
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

/* ------------------------- scouted → calendar helpers ------------------------ */

/** True when a discovered card carries (or implies) a date we can put on the calendar. */
export function scoutHasDate(card: DigestCardData): boolean {
  if (card.type === "time_window") return true;
  if (card.type === "news_scout") return guessDateTime(`${card.title}. ${card.summary}`) !== null;
  return false;
}

/** One-tap "Add to calendar" for a discovered card, using its best-known date/time. */
export async function addScoutWithBestGuess(card: DigestCardData): Promise<{ ok: boolean; error?: string }> {
  if (card.type !== "news_scout" && card.type !== "time_window") return { ok: false, error: "Not a discovered event." };
  const v = initialPickerValue(card);
  const iso = v.date ? isoFromLocal(v.date, v.time, clientTimeZone()) : null;
  if (!iso) return { ok: false, error: "Couldn't work out a date." };
  return addScoutedToCalendar({ id: card.id, startsAt: iso, hasTime: v.time !== null });
}
