"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { DigestCardData } from "@/lib/types";
import type { BusyInterval } from "@/lib/conflicts";
import { DigestCard, type ResolveStatus } from "./DigestCard";
import { DigestHeader } from "./DigestHeader";
import { AllCaughtUp } from "./AllCaughtUp";
import { updateCardStatus } from "@/app/feed-actions";

interface DigestFeedProps {
  initialCards: DigestCardData[];
  dateLabel: string;
  dateSub: string;
  /** When true, resolutions persist to Supabase (off for mock decks). */
  persist?: boolean;
  /** Accepted calendar blocks, for the per-card conflict check. */
  busy?: BusyInterval[];
}

export function DigestFeed({ initialCards, dateLabel, dateSub, persist = false, busy = [] }: DigestFeedProps) {
  const [cards, setCards] = useState<DigestCardData[]>(initialCards);
  const [saved, setSaved] = useState(0);
  const [accepted, setAccepted] = useState(0);

  const total = initialCards.length;
  const remaining = cards.length;

  const handleResolve = (id: string, status: ResolveStatus) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (status === "saved") setSaved((n) => n + 1);
    if (status === "accepted") setAccepted((n) => n + 1);
    if (persist) void updateCardStatus(id, status);
  };

  return (
    <div className="w-full">
      <DigestHeader
        dateLabel={dateLabel}
        dateSub={dateSub}
        remaining={remaining}
        total={total}
      />

      <div className="space-y-3">
        <AnimatePresence initial={false} mode="popLayout">
          {cards.map((card) => (
            <DigestCard key={card.id} card={card} onResolve={handleResolve} busy={busy} />
          ))}
        </AnimatePresence>
      </div>

      {remaining === 0 && <AllCaughtUp saved={saved} accepted={accepted} />}
    </div>
  );
}
