"use client";

import { useState } from "react";
import { X, ExternalLink, Bookmark } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { CARD_TYPES } from "@/lib/cardTypes";
import type { DigestCardData } from "@/lib/types";
import { updateCardStatus } from "@/app/feed-actions";
import { RichText } from "./RichText";

export function LibraryWall({ initial }: { initial: DigestCardData[] }) {
  const [cards, setCards] = useState(initial);

  const remove = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    void updateCardStatus(id, "dismissed");
  };

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<Bookmark className="h-7 w-7" strokeWidth={2} />}
        title="Your Library is empty"
        body="Tap the bookmark on any card to save it here — a calm, permanent wall of the things you wanted to keep."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <SavedCard key={card.id} card={card} onRemove={() => remove(card.id)} />
      ))}
    </div>
  );
}

function SavedCard({ card, onRemove }: { card: DigestCardData; onRemove: () => void }) {
  const chip =
    card.type === "news_scout"
      ? { text: CATEGORIES[card.category]?.tag ?? "#News", cls: CATEGORIES[card.category]?.chipClass ?? "" }
      : { text: CARD_TYPES[card.type]?.label ?? "Card", cls: CARD_TYPES[card.type]?.chipClass ?? "" };

  const link =
    card.type === "news_scout" ? card.actionUrl : card.type === "social_ping" ? card.link : undefined;

  return (
    <div className="relative flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-medium ring-1 ring-inset ${chip.cls}`}
        >
          {chip.text}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove from Library"
          title="Remove from Library"
          className="rounded-full p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      <SavedBody card={card} />

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </a>
      )}
    </div>
  );
}

function SavedBody({ card }: { card: DigestCardData }) {
  switch (card.type) {
    case "news_scout":
      return (
        <>
          <h3 className="text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
            {card.title}
          </h3>
          <RichText
            text={card.summary}
            className="mt-1 line-clamp-4 text-[0.85rem] leading-relaxed text-neutral-500 dark:text-neutral-400"
          />
        </>
      );
    case "social_ping":
      return (
        <>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">from {card.senderName}</p>
          <RichText
            text={card.message}
            className="mt-1 line-clamp-4 text-[0.9rem] leading-relaxed text-neutral-700 dark:text-neutral-200"
          />
        </>
      );
    case "social_invite":
      return (
        <>
          <h3 className="text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
            {card.eventTitle}
          </h3>
          <p className="mt-1 text-[0.85rem] text-neutral-500 dark:text-neutral-400">
            {card.eventTime}
            {card.location ? ` · ${card.location}` : ""}
          </p>
        </>
      );
    case "calendar_radar":
      return (
        <>
          <h3 className="text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
            {card.title}
          </h3>
          <p className="mt-1 text-[0.85rem] text-neutral-500 dark:text-neutral-400">
            {card.time}
            {card.location ? ` · ${card.location}` : ""}
          </p>
        </>
      );
    case "social_post":
      return (
        <>
          {card.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.imageUrl}
              alt={card.caption ?? "Post"}
              className="mb-2 aspect-video w-full rounded-lg object-cover"
            />
          )}
          <p className="text-xs text-neutral-400 dark:text-neutral-500">from {card.senderName}</p>
          {card.caption && (
            <p className="mt-0.5 line-clamp-3 text-[0.85rem] leading-relaxed text-neutral-700 dark:text-neutral-200">
              {card.caption}
            </p>
          )}
        </>
      );
  }
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
      <p className="mt-2 max-w-xs text-[0.95rem] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {body}
      </p>
    </div>
  );
}
