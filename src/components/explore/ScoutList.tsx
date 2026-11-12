"use client";

import { useState } from "react";
import { DigestCard } from "@/components/DigestCard";
import { updateCardStatus } from "@/app/feed-actions";
import type { DigestCardData } from "@/lib/types";

/** Things the scout found on the web for you, shown in Explore under the posts. */
export function ScoutList({ cards }: { cards: DigestCardData[] }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = cards.filter((c) => !gone.has(c.id));
  if (shown.length === 0) return null;
  const hide = (id: string) => setGone((s) => new Set(s).add(id));
  return (
    <section className="space-y-3">
      <h3 className="text-[12px] font-bold uppercase tracking-wide text-neutral-500">Found on the web for you</h3>
      {shown.map((c) => (
        <div key={c.id} className="space-y-1.5">
          {/* Adding to the calendar already updates the card server-side. */}
          <DigestCard card={c} onResolve={() => hide(c.id)} />
          <button
            type="button"
            onClick={() => {
              hide(c.id);
              void updateCardStatus(c.id, "dismissed");
            }}
            className="mx-auto block h-9 px-3 text-[13px] font-semibold text-neutral-500 hover:text-neutral-800"
          >
            Not for me
          </button>
        </div>
      ))}
    </section>
  );
}
