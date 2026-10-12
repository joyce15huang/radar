"use client";

import { Plus } from "lucide-react";
import { RemoveSectionButton } from "./SectionControls";

/** The white card every plan-page section sits in (same as Guests). */
export const PLAN_CARD = "overflow-hidden rounded-[18px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]";

/** Section title styled like "Guests": bold title, quiet summary, host's ×. */
export function PlanSectionHeader({
  title,
  meta,
  eventId,
  module,
  canRemove,
}: {
  title: string;
  meta?: string;
  eventId: string;
  module: string;
  canRemove?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">
        {title}
        {meta && <span className="ml-1.5 text-[14px] font-medium text-neutral-500">{meta}</span>}
      </h2>
      {canRemove && <RemoveSectionButton eventId={eventId} module={module} />}
    </div>
  );
}

/** "+ Offer a ride" — the last row of a section's card. */
export function AddRow({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-neutral-50"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-neutral-300">
        <Plus className="h-4 w-4 text-neutral-500" strokeWidth={2.4} />
      </span>
      <span className="text-[15px] font-semibold text-neutral-700">{label}</span>
      {hint && <span className="truncate text-[13px] text-neutral-400">{hint}</span>}
    </button>
  );
}

/** Forms opened from an add row render inside the card with this wrapper. */
export const IN_CARD_FORM = "bg-neutral-50/70 p-4";
