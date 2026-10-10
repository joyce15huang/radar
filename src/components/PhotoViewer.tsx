"use client";

import { useEffect, useRef, useState } from "react";
import { X, Heart, Check, Loader2, LayoutGrid } from "lucide-react";
import { toggleLike, getPostSocial, addToGrid } from "@/app/photo-actions";
import { savePhoto } from "@/lib/savePhoto";

export interface ViewerPhoto {
  postId: string;
  index: number;
  url: string;
  author: string;
  date?: string;
}

const keyOf = (p: { postId: string; index: number }) => `${p.postId}:${p.index}`;

/** Full-screen, in-app photo viewer for an event album: swipe, like, save, add to grid. */
export function PhotoViewer({
  photos,
  start,
  title,
  pinned,
  onPinned,
  onClose,
}: {
  photos: ViewerPhoto[];
  start: number;
  title?: string;
  pinned: Set<string>;
  onPinned: (keys: string[]) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const stripRef = useRef<HTMLDivElement>(null);
  const [social, setSocial] = useState<Record<string, { likes: number; liked: boolean }>>({});
  const [busy, setBusy] = useState<null | "pin" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const photo = photos[index];

  // Open on the tapped photo.
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollTo({ left: start * el.clientWidth });
  }, [start]);

  // Likes are per post; fetch once per post.
  useEffect(() => {
    if (!photo || social[photo.postId]) return;
    let live = true;
    getPostSocial(photo.postId).then((s) => {
      if (live) setSocial((m) => ({ ...m, [photo.postId]: { likes: s.likes, liked: s.liked } }));
    });
    return () => {
      live = false;
    };
  }, [photo, social]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const el = stripRef.current;
        if (!el) return;
        const next = Math.max(0, Math.min(photos.length - 1, index + (e.key === "ArrowRight" ? 1 : -1)));
        el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, photos.length, onClose]);

  if (!photo) return null;
  const s = social[photo.postId];
  const isPinned = pinned.has(keyOf(photo));

  async function like() {
    const cur = social[photo.postId] ?? { likes: 0, liked: false };
    const next = { likes: cur.likes + (cur.liked ? -1 : 1), liked: !cur.liked };
    setSocial((m) => ({ ...m, [photo.postId]: next }));
    const r = await toggleLike(photo.postId);
    if (!r.ok) {
      setSocial((m) => ({ ...m, [photo.postId]: cur }));
      setError(r.error ?? null);
    }
  }
  async function pin() {
    setBusy("pin");
    setError(null);
    const r = await addToGrid([{ postId: photo.postId, index: photo.index }]);
    setBusy(null);
    if (!r.ok) return setError(r.error ?? "Couldn't add that.");
    onPinned([keyOf(photo)]);
  }
  async function save() {
    setBusy("save");
    await savePhoto(photo.url, `${title ?? "photo"}-${index + 1}.jpg`.replace(/\s+/g, "-").toLowerCase());
    setBusy(null);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#1C1411] text-[#FFFCF8]" role="dialog" aria-modal="true" aria-label="Photo">
      <div className="flex h-16 shrink-0 items-center justify-between pl-4 pr-2 pt-[env(safe-area-inset-top)]">
        <span className="truncate text-sm font-semibold text-white/75">
          {index + 1} of {photos.length}
          {title ? ` · ${title}` : ""}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={stripRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
      >
        {photos.map((p) => (
          <div key={keyOf(p)} className="flex h-full w-full shrink-0 snap-center items-center justify-center px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={`Photo by ${p.author}`} className="max-h-full max-w-full rounded-[20px] object-contain" draggable={false} />
          </div>
        ))}
      </div>

      {photos.length > 1 && photos.length <= 12 && (
        <div className="flex justify-center gap-1.5 py-3">
          {photos.map((p, i) => (
            <span key={keyOf(p)} className={`h-1.5 rounded-full transition-all ${i === index ? "w-[18px] bg-white" : "w-1.5 bg-white/35"}`} />
          ))}
        </div>
      )}

      <div className="shrink-0 space-y-3.5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-sky-400 text-[13px] font-bold uppercase text-neutral-900">
            {photo.author.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{photo.author}</span>
            {photo.date && <span className="block text-xs text-white/60">{photo.date}</span>}
          </span>
          <button
            type="button"
            onClick={like}
            aria-pressed={!!s?.liked}
            aria-label={s?.liked ? "Unlike" : "Like"}
            className="flex h-10 items-center gap-1.5 px-2 text-sm font-semibold"
          >
            <Heart className={`h-6 w-6 ${s?.liked ? "fill-fuchsia-500 text-fuchsia-500" : ""}`} strokeWidth={2} />
            {s ? s.likes : ""}
          </button>
        </div>
        {error && <p className="text-center text-sm text-rose-300">{error}</p>}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={save}
            disabled={busy !== null}
            className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-white/[0.12] text-[15px] font-semibold"
          >
            {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} Save to phone
          </button>
          <button
            type="button"
            onClick={pin}
            disabled={busy !== null || isPinned}
            className={`flex h-[50px] items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold ${
              isPinned ? "bg-white/[0.12] text-white/80" : "bg-fuchsia-700 text-white"
            }`}
          >
            {busy === "pin" ? <Loader2 className="h-4 w-4 animate-spin" /> : isPinned ? <Check className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            {isPinned ? "On your grid" : "Add to my grid"}
          </button>
        </div>
      </div>
    </div>
  );
}
