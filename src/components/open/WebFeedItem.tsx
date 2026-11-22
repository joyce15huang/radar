"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarPlus, Globe, Send, UserPlus, X } from "lucide-react";
import { CalendarPicker, cardTile, safeHostname, whenText, type Scouted } from "@/components/DigestCard";
import { updateCardStatus } from "@/app/feed-actions";

/** "Anyone want to go? <title>" for the composer, with the day if the find has one. */
function askHref(card: Scouted): string {
  const day = (card.type === "time_window" ? card.opensAt ?? card.expiresAt : undefined)?.slice(0, 10);
  const qs = new URLSearchParams({ text: `Anyone want to go? ${card.title}` });
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) qs.set("day", day);
  return `/p/new?${qs.toString()}`;
}

/** A web find, laid out like a post: source, the text, its day, then Save · Ask who's going · Share. */
export function WebFeedItem({ card, divider = true }: { card: Scouted; divider?: boolean }) {
  const [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const url = (card as { actionUrl?: string }).actionUrl;
  const tile = cardTile(card);
  const when = whenText(card) ?? (tile ? [tile.top, tile.day, tile.time].filter(Boolean).join(" ") : "");
  const where = [card.place, card.cost].filter(Boolean).join(" · ");

  async function share() {
    const link = url ?? window.location.href;
    try {
      if (navigator.share) await navigator.share({ text: card.title, url: link });
      else await navigator.clipboard.writeText(link);
    } catch {
      /* dismissed */
    }
  }

  return (
    <article className={`flex gap-3 py-4 ${divider ? "border-b border-neutral-200/80" : ""}`}>
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-500" aria-hidden>
        <Globe className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-tight">
              <span className="font-bold text-neutral-900">From the web</span>
              {url && <span className="text-neutral-500"> · {safeHostname(url)}</span>}
            </p>
            <p className="truncate text-[12px] text-neutral-500">{where || card.topic || "Nearby"}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setHidden(true);
              void updateCardStatus(card.id, "dismissed");
            }}
            aria-label="Hide"
            className="-mr-1.5 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="block">
            <p className="mt-1.5 text-[16px] font-semibold leading-[1.45] text-neutral-900">{card.title}</p>
            {card.summary && <p className="mt-0.5 line-clamp-2 text-[15px] leading-[1.45] text-neutral-700">{card.summary}</p>}
          </a>
        ) : (
          <>
            <p className="mt-1.5 text-[16px] font-semibold leading-[1.45] text-neutral-900">{card.title}</p>
            {card.summary && <p className="mt-0.5 line-clamp-2 text-[15px] leading-[1.45] text-neutral-700">{card.summary}</p>}
          </>
        )}
        {when && <p className="mt-1.5 text-[14px] text-neutral-500">{when}</p>}

        {picking && !saved ? (
          <CalendarPicker
            card={card}
            onAdded={() => {
              setSaved(true);
              setPicking(false);
            }}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <div className="mt-2 flex items-center gap-5 text-neutral-500">
            <button
              type="button"
              onClick={() => !saved && setPicking(true)}
              aria-pressed={saved}
              aria-label={saved ? "On your calendar" : "Save to your calendar"}
              className={`-ml-1.5 flex h-9 items-center px-1.5 ${saved ? "text-fuchsia-800" : ""}`}
            >
              {saved ? <CalendarCheck className="h-5 w-5" strokeWidth={2} /> : <CalendarPlus className="h-5 w-5" strokeWidth={1.8} />}
            </button>
            <Link href={askHref(card)} aria-label="Ask who's going" className="flex h-9 items-center gap-1.5 px-1">
              <UserPlus className="h-5 w-5" strokeWidth={1.8} />
              <span className="text-[13px]">Ask who&rsquo;s going</span>
            </Link>
            <button type="button" onClick={share} aria-label="Share" className="flex h-9 items-center px-1">
              <Send className="h-[19px] w-[19px]" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
