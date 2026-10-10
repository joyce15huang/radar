"use client";

import { useState } from "react";
import { LayoutGrid, Loader2, Check } from "lucide-react";
import { addToGrid } from "@/app/photo-actions";
import { PhotoViewer, type ViewerPhoto } from "./PhotoViewer";

const COLLAPSED = 9;
const keyOf = (p: { postId: string; index: number }) => `${p.postId}:${p.index}`;

/**
 * An event's shared album: a 3-column grid. Tap a photo to view it in-app;
 * "Select" picks several to put on your profile grid at once.
 */
export function EventPhotos({
  photos,
  people,
  title,
  initialPinned,
  addButton,
}: {
  photos: ViewerPhoto[];
  people: number;
  title: string;
  initialPinned: string[];
  /** The "Add" photos button (uploader), rendered in the header. */
  addButton?: React.ReactNode;
}) {
  const [pinned, setPinned] = useState(() => new Set(initialPinned));
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = all ? photos : photos.slice(0, COLLAPSED);
  const markPinned = (keys: string[]) => setPinned((s) => new Set([...s, ...keys]));

  function tap(i: number) {
    const k = keyOf(photos[i]);
    if (!selecting) return setViewing(i);
    if (pinned.has(k)) return;
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }

  async function addPicked() {
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    const items = picked.map((k) => {
      const [postId, index] = k.split(":");
      return { postId, index: Number(index) };
    });
    const r = await addToGrid(items);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Couldn't add those.");
    markPinned(picked);
    setToast(`Added ${r.added} to your grid`);
    window.setTimeout(() => setToast(null), 2200);
    setPicked([]);
    setSelecting(false);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">Photos</h2>
          <p className="text-[13px] text-neutral-500">
            {selecting
              ? "Tap photos to add them to your grid"
              : photos.length > 0
                ? `${photos.length} from ${people} ${people === 1 ? "person" : "people"}`
                : "No photos yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {photos.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelecting((v) => !v);
                setPicked([]);
                setError(null);
              }}
              className="h-9 rounded-[10px] bg-neutral-200/70 px-3.5 text-[13px] font-semibold text-neutral-900"
            >
              {selecting ? "Cancel" : "Select"}
            </button>
          )}
          {!selecting && addButton}
        </div>
      </div>

      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-[3px] overflow-hidden rounded-xl">
          {shown.map((p, i) => {
            const k = keyOf(p);
            const n = picked.indexOf(k);
            const isPinned = pinned.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => tap(i)}
                aria-pressed={selecting ? n >= 0 : undefined}
                aria-label={`Photo by ${p.author}`}
                className={`relative aspect-square overflow-hidden bg-neutral-200 ${n >= 0 ? "ring-[3px] ring-inset ring-fuchsia-700" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className={`h-full w-full object-cover transition ${selecting && isPinned ? "opacity-50" : ""}`} />
                {selecting &&
                  (isPinned ? (
                    <span className="absolute right-1.5 top-1.5 flex h-6 items-center gap-1 rounded-full bg-neutral-900/70 px-2 text-[11px] font-semibold text-white">
                      <Check className="h-3 w-3" /> On grid
                    </span>
                  ) : n >= 0 ? (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-fuchsia-700 text-[12px] font-bold text-white">
                      {n + 1}
                    </span>
                  ) : (
                    <span className="absolute right-1.5 top-1.5 h-[22px] w-[22px] rounded-full border-2 border-white/95 bg-black/15" />
                  ))}
                {!selecting && isPinned && (
                  <LayoutGrid className="absolute right-1.5 top-1.5 h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-600">
          Add the first photos from {title}.
        </div>
      )}

      {photos.length > COLLAPSED && (
        <button type="button" onClick={() => setAll((v) => !v)} className="w-full py-2 text-center text-sm font-semibold text-neutral-700">
          {all ? "Show fewer" : `See all ${photos.length} photos`}
        </button>
      )}

      {selecting && (
        <div className="fixed inset-x-3 bottom-[calc(1.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex h-16 max-w-xl items-center justify-between rounded-[20px] bg-neutral-900 pl-[18px] pr-2 shadow-[0_14px_34px_rgba(46,33,29,0.3)]">
          <span className="text-[15px] font-semibold text-white">
            {error ? <span className="text-rose-300">{error}</span> : `${picked.length} selected`}
          </span>
          <button
            type="button"
            onClick={addPicked}
            disabled={busy || picked.length === 0}
            className="flex h-[46px] items-center gap-2 rounded-[14px] bg-fuchsia-700 px-[18px] text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutGrid className="h-4 w-4" />}
            {picked.length > 0 ? `Add ${picked.length} to my grid` : "Add to my grid"}
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-[calc(2rem+env(safe-area-inset-bottom))] z-40 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
            <Check className="h-4 w-4" /> {toast}
          </span>
        </div>
      )}

      {viewing !== null && (
        <PhotoViewer
          photos={photos}
          start={viewing}
          title={title}
          pinned={pinned}
          onPinned={markPinned}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}
