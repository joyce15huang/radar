"use client";

import { useState } from "react";
import Link from "next/link";
import { AddPhotos } from "./AddPhotos";

interface Row {
  id: string;
  title: string;
  month: string;
  day: string;
  sub: string;
  canOpen: boolean;
}
const COLLAPSED = 5;

/** Past plans that have no photos yet: one compact row each, five until you ask for more. */
export function NoPhotoPlans({ rows, isOwner }: { rows: Row[]; isOwner: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, COLLAPSED);
  return (
    <div className="space-y-2 pt-1">
      <h3 className="text-[13px] font-bold text-neutral-500">
        {isOwner ? "No photos yet" : "Without photos"} · {rows.length}
      </h3>
      <ul className="divide-y divide-neutral-100 rounded-[18px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
        {shown.map((r) => {
          const text = (
            <>
              <span className="block truncate text-[15px] font-semibold text-neutral-900">{r.title}</span>
              <span className="block truncate text-[13px] text-neutral-500">{r.sub}</span>
            </>
          );
          return (
            <li key={r.id} className="flex items-center gap-3 py-2.5 pl-3.5 pr-1.5">
              <span className="flex h-[46px] w-[42px] shrink-0 flex-col items-center justify-center rounded-xl bg-neutral-200">
                <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-600">{r.month}</span>
                <span className="text-[16px] font-bold leading-none text-neutral-900">{r.day}</span>
              </span>
              {r.canOpen ? (
                <Link href={`/event/${r.id}`} className="min-w-0 flex-1">
                  {text}
                </Link>
              ) : (
                <span className="min-w-0 flex-1">{text}</span>
              )}
              {isOwner && <AddPhotos eventId={r.id} eventTitle={r.title} variant="link" />}
            </li>
          );
        })}
      </ul>
      {rows.length > COLLAPSED && (
        <button type="button" onClick={() => setAll((v) => !v)} className="h-11 w-full text-[14px] font-semibold text-neutral-600">
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
