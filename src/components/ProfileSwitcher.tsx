"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, UserRound } from "lucide-react";
import { initials } from "@/lib/cardTypes";
import {
  createPersona,
  switchPersona,
  type PersonaSummary,
} from "@/app/persona-actions";

/** Instagram-style persona switcher: pick an existing profile or add a new one. */
export function ProfileSwitcher({ personas }: { personas: PersonaSummary[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSwitch(id: string) {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    const res = await switchPersona(id);
    if (!res.ok) {
      setError(res.error ?? "Couldn't switch.");
      setBusyId(null);
      return;
    }
    router.refresh();
    setBusyId(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    const res = await createPersona({ username, displayName });
    if (!res.ok) {
      setError(res.error ?? "Couldn't create the profile.");
      setCreating(false);
      return;
    }
    setUsername("");
    setDisplayName("");
    setAdding(false);
    setCreating(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {personas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleSwitch(p.id)}
            disabled={p.isActive || busyId !== null}
            className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
              p.isActive
                ? "border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-900"
                : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900"
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">
              {initials(p.displayName || p.username || "?")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {p.displayName || (p.username ? `@${p.username}` : "Unnamed profile")}
              </span>
              <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                {p.username ? `@${p.username}` : "no username yet"}
                {p.isPrimary ? " · primary" : ""}
              </span>
            </span>
            {busyId === p.id ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-neutral-400" />
            ) : p.isActive ? (
              <Check className="h-5 w-5 shrink-0 text-neutral-900 dark:text-white" strokeWidth={2.5} />
            ) : null}
          </button>
        ))}
      </div>

      {adding ? (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Username
            </label>
            <div className="flex items-center gap-1 rounded-xl border border-neutral-200 bg-white px-3 dark:border-neutral-800 dark:bg-neutral-950">
              <span className="text-sm text-neutral-400">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sf_social_club"
                autoFocus
                className="w-full bg-transparent py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Display name (optional)
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="SF Social Club"
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={creating || !username.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
              Create &amp; switch
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="rounded-xl px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-white"
        >
          <Plus className="h-4 w-4" /> Add another profile
        </button>
      )}

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
