"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import { addEventModule, removeEventModule } from "@/app/module-actions";

const LABELS: Record<string, string> = {
  carpool: "Carpool",
  expenses: "Expenses",
  tasks: "Tasks",
};
const ALL = ["carpool", "expenses", "tasks"] as const;

/** Natural-language list: "carpool", "carpool or tasks", "carpool, expenses or tasks". */
function orList(items: string[]): string {
  const low = items.map((m) => LABELS[m].toLowerCase());
  return low.length <= 1 ? low.join("") : `${low.slice(0, -1).join(", ")} or ${low[low.length - 1]}`;
}

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
    <div className="rounded-2xl bg-fuchsia-50 p-4">
      <p className="text-[15px] font-semibold text-neutral-900">Add {orList([...missing])}?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {missing.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => add(m)}
            disabled={!!busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-3.5 text-sm font-semibold text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:bg-neutral-50 disabled:opacity-60"
          >
            {busy === m ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {LABELS[m]}
          </button>
        ))}
      </div>
    </div>
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
