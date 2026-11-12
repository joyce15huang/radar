"use client";

import { useState } from "react";
import { RichText } from "@/components/RichText";
import { CalendarPicker, cardTile, safeHostname, scoutHasDate, whenText, type Scouted } from "@/components/DigestCard";
import { DateLead } from "./DateLead";

/**
 * A web find in Explore, text-led: when and where first, then a short summary
 * of what it is. No picture-less icon panel.
 */
export function ScoutCard({ card, onAdded, onDismiss }: { card: Scouted; onAdded: () => void; onDismiss: () => void }) {
  const [picking, setPicking] = useState(false);
  const tile = cardTile(card);
  const dated = scoutHasDate(card);
  const label = whenText(card);
  const when = tile ? [label ?? `${tile.top} ${tile.day}`, label ? null : tile.time].filter(Boolean).join(" · ") : (label ?? "Anytime");
  const where = [card.place, card.cost].filter(Boolean).join(" · ") || null;
  const url = card.type === "news_scout" ? card.actionUrl : (card as { actionUrl?: string }).actionUrl;
  const foot = [card.topic, "Found on the web", url ? safeHostname(url) : null].filter(Boolean).join(" · ");

  return (
    <article className="space-y-3 rounded-[22px] bg-white p-4 shadow-[0_10px_28px_rgba(46,33,29,0.08)]">
      <DateLead top={tile?.top} day={tile?.day} when={when} title={card.title} where={where} />
      {card.summary && <RichText text={card.summary} className="line-clamp-3 text-[14px] leading-relaxed text-neutral-700" />}
      <p className="truncate text-[12px] font-medium text-neutral-500">{foot}</p>
      {picking ? (
        <CalendarPicker card={card} onAdded={onAdded} onCancel={() => setPicking(false)} />
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDismiss} className="h-11 px-1.5 text-[13px] font-semibold text-neutral-500 hover:text-neutral-800">
            Not for me
          </button>
          <span className="flex-1" />
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center rounded-xl border border-neutral-200 bg-white px-3.5 text-[14px] font-semibold text-neutral-900"
            >
              Details
            </a>
          )}
          <button type="button" onClick={() => setPicking(true)} className="h-11 rounded-xl bg-fuchsia-700 px-3.5 text-[14px] font-bold text-white hover:bg-fuchsia-800">
            {dated ? "Add to calendar" : "Pick a day"}
          </button>
        </div>
      )}
    </article>
  );
}
