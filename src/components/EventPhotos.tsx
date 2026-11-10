"use client";

import { useState } from "react";
import { PhotoViewer, type ViewerPhoto } from "./PhotoViewer";

const COLLAPSED = 9;
const keyOf = (p: { postId: string; index: number }) => `${p.postId}:${p.index}`;

/** An event's shared album: a 3-column grid. Tap a photo to view it in-app. */
export function EventPhotos({
  photos,
  people,
  title,
  addButton,
}: {
  photos: ViewerPhoto[];
  people: number;
  title: string;
  /** The "Add" photos button (uploader), rendered in the header. */
  addButton?: React.ReactNode;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? photos : photos.slice(0, COLLAPSED);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">Photos</h2>
          <p className="text-[13px] text-neutral-500">
            {photos.length > 0
              ? `${photos.length} from ${people} ${people === 1 ? "person" : "people"}`
              : "No photos yet"}
          </p>
        </div>
        {addButton}
      </div>

      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-[3px] overflow-hidden rounded-xl">
          {shown.map((p, i) => (
            <button
              key={keyOf(p)}
              type="button"
              onClick={() => setViewing(i)}
              aria-label={`Photo by ${p.author}`}
              className="relative aspect-square overflow-hidden bg-neutral-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
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

      {viewing !== null && (
        <PhotoViewer photos={photos} start={viewing} title={title} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}
