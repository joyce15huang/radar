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

/** Host-only row of dashed chips to add a not-yet-present section. */
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
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        Add section
      </span>
      {missing.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => add(m)}
          disabled={!!busy}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-400 hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {busy === m ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {LABELS[m]}
        </button>
      ))}
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
