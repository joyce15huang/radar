"use client";

import { useState, useRef, useActionState, type KeyboardEvent } from "react";
import { Loader2, Check, Sparkles, MapPin, X, Plus } from "lucide-react";
import { savePreferences, type SaveState } from "@/app/profile/actions";

const SUGGESTIONS = [
  "San Francisco",
  "San Jose",
  "Oakland",
  "New York",
  "Los Angeles",
  "Seattle",
];

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of list) {
    const v = normalize(c);
    if (!v) continue;
    const k = v.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

export function PreferencesForm({ initialLocations }: { initialLocations: string[] }) {
  const [cities, setCities] = useState<string[]>(() => dedupe(initialLocations ?? []));
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState<SaveState, FormData>(
    savePreferences,
    { status: "idle" },
  );

  // Whatever is typed but not yet "entered" is still included on submit.
  const finalCities = draft.trim() ? dedupe([...cities, draft]) : cities;

  const add = (raw: string) => {
    const merged = dedupe([...cities, raw]);
    setCities(merged);
    setDraft("");
    inputRef.current?.focus();
  };
  const remove = (city: string) =>
    setCities((prev) => prev.filter((c) => c !== city));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft.trim()) add(draft);
    } else if (e.key === "Backspace" && !draft && cities.length) {
      remove(cities[cities.length - 1]);
    }
  };

  const remaining = SUGGESTIONS.filter(
    (s) => !finalCities.some((c) => c.toLowerCase() === s.toLowerCase()),
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="locations" value={JSON.stringify(finalCities)} />

      <div>
        <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Your locations
        </label>
        <p className="mb-3 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          Add the cities you want your daily deck built around — local events, hidden gems, and
          time-sensitive opportunities near each. Add as many as you like.
        </p>

        <div
          onClick={() => inputRef.current?.focus()}
          className="flex min-h-[3.25rem] flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-sm focus-within:border-neutral-400 focus-within:ring-2 focus-within:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:focus-within:ring-neutral-700"
        >
          {cities.map((city) => (
            <span
              key={city}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 py-1 pl-2.5 pr-1.5 text-sm font-medium text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <MapPin className="h-3.5 w-3.5 text-neutral-400" strokeWidth={2} />
              {city}
              <button
                type="button"
                onClick={() => remove(city)}
                aria-label={`Remove ${city}`}
                className="rounded-full p-0.5 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={cities.length ? "Add another city…" : "e.g. San Francisco"}
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-600"
          />
        </div>

        {remaining.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="py-1 text-xs text-neutral-400 dark:text-neutral-500">Quick add:</span>
            {remaining.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending || finalCities.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Building your deck…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Save &amp; refresh my deck
            </>
          )}
        </button>

        {isPending && (
          <span className="text-sm text-neutral-400 dark:text-neutral-500">
            This runs the scout live — about 15–25 seconds.
          </span>
        )}

        {!isPending && state.status === "saved" && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" strokeWidth={2.5} />
            {typeof state.generated === "number" && state.generated > 0
              ? `Saved — ${state.generated} fresh cards ready on your feed`
              : "Saved"}
          </span>
        )}

        {!isPending && state.status === "error" && (
          <span className="text-sm text-rose-600 dark:text-rose-400">{state.message}</span>
        )}
      </div>

      {!isPending && state.status === "saved" && state.message && (
        <p className="text-sm text-amber-600 dark:text-amber-400">{state.message}</p>
      )}
    </form>
  );
}
