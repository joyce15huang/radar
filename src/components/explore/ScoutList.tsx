"use client";

import { useState } from "react";
import { updateCardStatus } from "@/app/feed-actions";
import type { DigestCardData } from "@/lib/types";
import { ScoutCard } from "./ScoutCard";

/** Things the scout found on the web for you, shown in Explore under the posts. */
export function ScoutList({ cards }: { cards: DigestCardData[] }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = cards.filter((c) => !gone.has(c.id));
  if (shown.length === 0) return null;
  const hide = (id: string) => setGone((s) => new Set(s).add(id));
  return (
    <>
      {shown.map((c) =>
        c.type === "news_scout" || c.type === "time_window" ? (
          <ScoutCard
            key={c.id}
            card={c}
            // Adding to the calendar already updates the card server-side.
            onAdded={() => hide(c.id)}
            onDismiss={() => {
              hide(c.id);
              void updateCardStatus(c.id, "dismissed");
            }}
          />
        ) : null,
      )}
    </>
  );
}
