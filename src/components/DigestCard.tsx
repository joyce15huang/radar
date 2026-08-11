"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  X,
  Check,
  MapPin,
  Link2,
  Bookmark,
  Hourglass,
  CalendarDays,
  CalendarPlus,
} from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { CARD_TYPES, initials } from "@/lib/cardTypes";
import type { DigestCardData, CardStatus } from "@/lib/types";
import { windowStatus, type WindowUrgency } from "@/lib/timeWindow";
import { eventDateLabel } from "@/lib/dateLabel";
import { PhotoGallery } from "./PhotoGallery";
import { RichText } from "./RichText";

/** Urgency → text color for the inline countdown next to the date. */
function urgencyText(urgency: WindowUrgency): string {
  switch (urgency) {
    case "urgent":
      return "text-red-600 dark:text-red-400";
    case "soon":
      return "text-amber-600 dark:text-amber-400";
    case "upcoming":
      return "text-sky-600 dark:text-sky-400";
    case "closed":
      return "text-neutral-400 dark:text-neutral-500";
    default:
      return "text-neutral-500 dark:text-neutral-400";
  }
}

/** Terminal statuses a card can resolve to from the deck. */
export type ResolveStatus = Extract<CardStatus, "saved" | "dismissed" | "accepted">;

interface DigestCardProps {
  card: DigestCardData;
  onResolve: (id: string, status: ResolveStatus) => void;
}

/* --------------------------------- shell ---------------------------------- */

export function DigestCard({ card, onResolve }: DigestCardProps) {
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

/** The universal top-right Save (bookmark) button. */
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

/**
 * The date shown on top of a scouted card, with the time_window countdown on the
 * same line (e.g. "Tue, Aug 12 · Closes in 2 days"). Replaces the old category /
 * "Window" tag chips. A dateless gem shows a soft "Ongoing" pill instead.
 */
function DateLine({
  card,
}: {
  card: Extract<DigestCardData, { type: "news_scout" | "time_window" }>;
}) {
  const dateText =
    card.type === "time_window" ? eventDateLabel(card.opensAt, card.expiresAt) : "";
  const w = card.type === "time_window" ? windowStatus(card) : null;
  const hasCountdown = Boolean(w && w.label);
  const gemFallback = card.type === "time_window" ? (card.windowLabel ?? "") : "";
  // Date pill text: the real date, else a soft label when there is no countdown.
  const pill = dateText || (hasCountdown ? "" : gemFallback || "Ongoing");

  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium">
      {pill && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 ring-1 ring-inset ring-neutral-200/70 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700/70">
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
          {pill}
        </span>
      )}
      {hasCountdown && w && (
        <span className={`inline-flex items-center gap-1 ${urgencyText(w.urgency)}`}>
          {pill && (
            <span aria-hidden className="text-neutral-300 dark:text-neutral-600">
              ·
            </span>
          )}
          <Hourglass className="h-3.5 w-3.5" strokeWidth={2} />
          {w.label}
        </span>
      )}
    </span>
  );
}

function CardHeader({
  card,
  onResolve,
}: {
  card: DigestCardData;
  onResolve: (id: string, status: ResolveStatus) => void;
}) {
  // Scouted cards: date on top-left, Save on the right. No category/type tag.
  if (card.type === "news_scout" || card.type === "time_window") {
    return (
      <div className="mb-3 flex items-center justify-between gap-2">
        <DateLine card={card} />
        <SaveButton onSave={() => onResolve(card.id, "saved")} />
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
        <SaveButton onSave={() => onResolve(card.id, "saved")} />
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
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
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

    case "news_scout":
      return (
        <div className="flex items-center gap-2">
          {card.actionUrl ? (
            <PrimaryButton
              onClick={() => window.open(card.actionUrl, "_blank", "noopener,noreferrer")}
            >
              {card.actionLabel}
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
            </PrimaryButton>
          ) : null}
          {dismiss}
        </div>
      );

    case "time_window":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <PrimaryButton onClick={() => onResolve(card.id, "accepted")}>
            <CalendarPlus className="h-4 w-4" strokeWidth={2.25} />
            Add Reminder
          </PrimaryButton>
          {card.actionUrl ? (
            <a
              href={card.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 dark:text-amber-400 dark:hover:bg-amber-500/10"
            >
              {card.actionLabel}
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
            </a>
          ) : null}
          <div className="ml-auto">{dismiss}</div>
        </div>
      );

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
