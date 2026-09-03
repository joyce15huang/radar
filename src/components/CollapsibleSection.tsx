"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A titled, collapsible wrapper for the event page's modules — so the page stays
 * a short stack of headers instead of one giant scroll. Children render lazily
 * (only once opened), which also defers each module's data fetch until needed.
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [everOpened, setEverOpened] = useState(defaultOpen);

  return (
    <section className="border-t border-neutral-200/70 pt-3 dark:border-neutral-800/70">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setEverOpened(true);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>
      {everOpened && <div className={`mt-3 ${open ? "" : "hidden"}`}>{children}</div>}
    </section>
  );
}
