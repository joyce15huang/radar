"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

/** Round "+" on the Calendar — opens the New plan composer (private or with friends). */
export function EventFormFab() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto flex max-w-xl justify-end px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6">
        <Link
          href="/plan/new"
          aria-label="New plan"
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-fuchsia-700 text-white shadow-[0_10px_24px_rgba(181,82,74,0.3)] transition hover:scale-105 hover:bg-fuchsia-800 active:scale-95"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </Link>
      </div>
    </div>
  );
}
