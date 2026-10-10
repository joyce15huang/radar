"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Car, Receipt, ListChecks, DollarSign } from "lucide-react";
import { addEventModule, removeEventModule } from "@/app/module-actions";
import { ADD_FEE_EVENT } from "./EventHeader";

const LABELS: Record<string, string> = {
  carpool: "Carpool",
  expenses: "Expenses",
  tasks: "Tasks",
};
const ALL = ["carpool", "expenses", "tasks"] as const;
const ICONS = { carpool: Car, expenses: Receipt, tasks: ListChecks } as const;

/**
 * Host-only "Add to this plan": a tile per add-on not on the plan yet (fee,
 * carpool, expenses, tasks). Works before anyone's invited.
 */
export function AddSectionBar({
  eventId,
  modules,
  hasFee = true,
  hasGuests = true,
}: {
  eventId: string;
  modules: string[];
  hasFee?: boolean;
  hasGuests?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const missing = ALL.filter((m) => !modules.includes(m));
  const tiles = (hasFee ? 0 : 1) + missing.length;
  if (tiles === 0) return null;
  const tileCls =
    "flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-neutral-300 text-[13px] font-semibold text-neutral-900 transition hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-60";

  async function add(m: string) {
    if (busy) return;
    setBusy(m);
    const res = await addEventModule(eventId, m);
    setBusy(null);
    if (res.ok) router.refresh();
  }

  return (
    <section className="rounded-[18px] bg-white p-4 shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
      <h2 className="text-[16px] font-bold text-neutral-900">Add to this plan</h2>
      <p className="mt-0.5 text-[13px] text-neutral-500">
        {hasGuests ? "Only shows up for guests once you add it." : "Set it up now — guests see it when you invite them."}
      </p>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles}, minmax(0, 1fr))` }}>
        {!hasFee && (
          <button type="button" onClick={() => window.dispatchEvent(new Event(ADD_FEE_EVENT))} className={tileCls}>
            <DollarSign className="h-5 w-5" strokeWidth={1.9} />
            Fee
          </button>
        )}
        {missing.map((m) => {
          const Icon = ICONS[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => add(m)}
              disabled={!!busy}
              className={tileCls}
            >
              {busy === m ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" strokeWidth={1.9} />}
              {LABELS[m]}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Host-only "×" in a section header — removes the section (data is kept). */
export function RemoveSectionButton({ eventId, module }: { eventId: string; module: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    const res = await removeEventModule(eventId, module);
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label="Remove section"
      className="rounded-full p-1 text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-60 dark:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
    </button>
  );
}
