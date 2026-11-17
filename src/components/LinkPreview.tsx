"use client";

import { useEffect, useState } from "react";
import { getLinkPreview, type LinkPreview as Preview } from "@/app/link-preview-actions";

/** A thin preview for a link (picture, title, site), like a shared link in a chat. Shows nothing until it has a title. */
export function LinkPreview({ url }: { url: string }) {
  const [p, setP] = useState<Preview | null>(null);
  const [badImg, setBadImg] = useState(false);
  useEffect(() => {
    let live = true;
    getLinkPreview(url)
      .then((r) => live && setP(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  if (!p) return null;
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      className="mt-2 flex items-center gap-3 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 pr-3 transition hover:bg-neutral-100"
    >
      {p.image && !badImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image} alt="" onError={() => setBadImg(true)} referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 object-cover" />
      )}
      <span className={`min-w-0 flex-1 py-2 ${p.image && !badImg ? "" : "pl-3"}`}>
        <span className="block truncate text-[12px] font-medium text-neutral-500">{p.site}</span>
        <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-neutral-900">{p.title}</span>
      </span>
    </a>
  );
}
