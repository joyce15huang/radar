"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AREAS } from "@/lib/areas";

export const AREA_COOKIE = "today_area";

/** All Bay Area · San Francisco · East Bay · Peninsula · South Bay. Remembered on this device. */
export function AreaChips({ current, feed }: { current: string; feed: string }) {
  const router = useRouter();
  // Light up the tapped chip right away; the feed follows when it's ready.
  const [picked, setPicked] = useState(current);
  const [pending, startTransition] = useTransition();
  const shown = pending ? picked : current;
  const go = (key: string) => {
    setPicked(key);
    document.cookie = `${AREA_COOKIE}=${key}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    const qs = new URLSearchParams();
    if (feed !== "nearby") qs.set("feed", feed);
    qs.set("area", key);
    startTransition(() => router.push(`/today?${qs.toString()}`, { scroll: false }));
  };
  return (
    <div aria-busy={pending} className="-mx-4 flex gap-1.5 overflow-x-auto border-b border-neutral-200 px-4 py-2.5 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {AREAS.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => go(a.key)}
          aria-pressed={shown === a.key}
          className={`h-[30px] shrink-0 rounded-full px-3 text-[13px] ${
            shown === a.key ? "bg-neutral-900 font-bold text-white" : "border border-neutral-300 font-semibold text-neutral-800"
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
