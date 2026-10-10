"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Car, Receipt, ListChecks } from "lucide-react";
import { addEventModule, removeEventModule } from "@/app/module-actions";

const LABELS: Record<string, string> = {
  carpool: "Carpool",
  expenses: "Expenses",
  tasks: "Tasks",
};
const ALL = ["carpool", "expenses", "tasks"] as const;
const ICONS = { carpool: Car, expenses: Receipt, tasks: ListChecks } as const;

/** Host-only nudge: "Add carpool, expenses or tasks?" with a chip per missing section. */
export function AddSectionBar({ eventId, modules }: { eventId: string; modules: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const missing = ALL.filter((m) => !modules.includes(m));
  if (missing.length === 0) return null;

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
      <p className="mt-0.5 text-[13px] text-neutral-500">Only shows up for guests once you add it.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {missing.map((m) => {
          const Icon = ICONS[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => add(m)}
              disabled={!!busy}
              className="flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-neutral-300 text-[13px] font-semibold text-neutral-900 transition hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-60"
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
