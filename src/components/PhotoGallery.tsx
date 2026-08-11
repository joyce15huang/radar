"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A multi-photo gallery. Supports swipe (native scroll-snap) AND left/right
 * arrow buttons below for desktop/mouse use. A single image renders plainly.
 */
export function PhotoGallery({ images, alt = "Photo" }: { images: string[]; alt?: string }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={images[0]}
        alt={alt}
        className="w-full rounded-xl border border-neutral-200/70 object-cover dark:border-neutral-800"
      />
    );
  }

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(images.length - 1, i));
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
    setActive(idx);
  };

  const atStart = active <= 0;
  const atEnd = active >= images.length - 1;

  const arrowCls =
    "flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800";

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl border border-neutral-200/70 [-ms-overflow-style:none] [scrollbar-width:none] dark:border-neutral-800 [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src}
            alt={`${alt} ${i + 1} of ${images.length}`}
            className="aspect-[4/3] w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>

      <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {active + 1}/{images.length}
      </div>

      <div className="mt-2 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goTo(active - 1)}
          disabled={atStart}
          aria-label="Previous photo"
          className={arrowCls}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>

        <div className="flex items-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to photo ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-4 bg-neutral-800 dark:bg-neutral-200" : "w-1.5 bg-neutral-300 dark:bg-neutral-700"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => goTo(active + 1)}
          disabled={atEnd}
          aria-label="Next photo"
          className={arrowCls}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
