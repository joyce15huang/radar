"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarPlus, Globe, MoreHorizontal, Send, UserPlus } from "lucide-react";
import { CalendarPicker, cardTile, safeHostname, whenText, type Scouted } from "@/components/DigestCard";
import { updateCardStatus } from "@/app/feed-actions";

/** "Anyone want to go? <title>" for the composer, with the day if the find has one. */
function askHref(card: Scouted): string {
  const day = (card.type === "time_window" ? card.opensAt ?? card.expiresAt : undefined)?.slice(0, 10);
  const qs = new URLSearchParams({ text: `Anyone want to go? ${card.title}` });
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) qs.set("day", day);
  return `/p/new?${qs.toString()}`;
}

/** The site's own little logo, or a globe when it has none. */
function SiteMark({ host }: { host: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-white" aria-hidden>
      {host && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://${host}/favicon.ico`}
          alt=""
          width={20}
          height={20}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-5 w-5 object-contain"
        />
      ) : (
        <Globe className="h-[18px] w-[18px] text-neutral-500" strokeWidth={1.8} />
      )}
    </span>
  );
}

/** A web find, laid out like a post: site · place · when, then one paragraph, then Save · Ask · Share. */
export function WebFeedItem({ card, divider = true }: { card: Scouted; divider?: boolean }) {
  const [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menu, setMenu] = useState(false);
  if (hidden) return null;

  const url = (card as { actionUrl?: string }).actionUrl;
  const host = url ? safeHostname(url) : null;
  const tile = cardTile(card);
  const when = whenText(card) ?? (tile ? [tile.top, tile.day, tile.time].filter(Boolean).join(" ") : "");
  const meta = [card.place, when].filter(Boolean).join(" · ");
  const title = card.title.replace(/[.!?]\s*$/, "");
  const text = card.summary ? `${title}. ${card.summary}` : title;

  async function share() {
    const link = url ?? window.location.href;
    try {
      if (navigator.share) await navigator.share({ text: card.title, url: link });
      else await navigator.clipboard.writeText(link);
    } catch {
      /* dismissed */
    }
  }

  const paragraph = <p className="mt-1 line-clamp-4 text-[16px] leading-[1.45] text-neutral-900">{text}</p>;

  return (
    <article className={`flex gap-3 py-3.5 ${divider ? "border-b border-neutral-200" : ""}`}>
      <SiteMark host={host} />
      <div className="min-w-0 flex-1">
        <div className="relative flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[15px] leading-tight">
            <span className="font-bold text-neutral-900">{host ?? "From the web"}</span>
            {meta && <span className="text-neutral-600"> · {meta}</span>}
          </p>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-label="More"
            aria-expanded={menu}
            className="-mr-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-200/60"
          >
            <MoreHorizontal className="h-[18px] w-[18px]" />
          </button>
          {menu && (
            <div className="absolute right-0 top-7 z-10 min-w-[160px] overflow-hidden rounded-xl bg-white py-1 shadow-[0_12px_30px_rgba(46,33,29,0.16)]">
              <button
                type="button"
                onClick={() => {
                  setHidden(true);
                  void updateCardStatus(card.id, "dismissed");
                }}
                className="block w-full px-4 py-2.5 text-left text-[14px] text-neutral-900 hover:bg-neutral-100"
              >
                Hide this
              </button>
            </div>
          )}
        </div>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="block">
            {paragraph}
          </a>
        ) : (
          paragraph
        )}

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
          <div className="mt-1.5 flex items-center gap-5 text-neutral-600">
            <button
              type="button"
              onClick={() => !saved && setPicking(true)}
              aria-pressed={saved}
              aria-label={saved ? "On your calendar" : "Save to your calendar"}
              title={saved ? "On your calendar" : "Save to your calendar"}
              className={`-ml-1.5 flex h-9 items-center px-1.5 ${saved ? "text-fuchsia-800" : ""}`}
            >
              {saved ? <CalendarCheck className="h-5 w-5" strokeWidth={2} /> : <CalendarPlus className="h-5 w-5" strokeWidth={1.8} />}
            </button>
            <Link href={askHref(card)} aria-label="Ask who's going" title="Ask who's going" className="flex h-9 items-center px-1">
              <UserPlus className="h-5 w-5" strokeWidth={1.8} />
            </Link>
            <button type="button" onClick={share} aria-label="Share" title="Share" className="flex h-9 items-center px-1">
              <Send className="h-[19px] w-[19px]" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
