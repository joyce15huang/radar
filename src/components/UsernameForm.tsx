"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Loader2, Check, ArrowRight } from "lucide-react";
import { setUsername } from "@/app/username-actions";
import { validateUsername, normalizeUsername } from "@/lib/username";

/**
 * Username picker. Used full-screen on /onboarding (mode="onboarding", redirects
 * home on success) and inside Settings (mode="settings", shows a saved note).
 */
export function UsernameForm({
  mode,
  initialUsername = "",
}: {
  mode: "onboarding" | "settings";
  initialUsername?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialUsername);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Live validity (for enabling the button + inline hint), authoritative check is
  // server-side on submit.
  const local = validateUsername(value);
  const dirty = normalizeUsername(value) !== normalizeUsername(initialUsername);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!local.ok) {
      setError(local.error);
      return;
    }
    setPending(true);
    const res = await setUsername(value);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't save that username.");
      return;
    }
    if (mode === "onboarding") {
      router.replace("/");
      router.refresh();
    } else {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="relative">
        <AtSign
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
          strokeWidth={2}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
            setError(null);
          }}
          autoFocus={mode === "onboarding"}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="yourname"
          className="w-full rounded-xl border border-neutral-200 bg-white py-3 pl-10 pr-3 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:ring-neutral-700"
        />
      </div>

      <p className="text-xs text-neutral-400 dark:text-neutral-600">
        3–20 characters: lowercase letters, numbers, and underscores. This is how friends find you.
      </p>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4" /> Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !local.ok || (mode === "settings" && !dirty)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Saving…
          </>
        ) : mode === "onboarding" ? (
          <>
            Continue <ArrowRight className="h-4 w-4" />
          </>
        ) : (
          "Save username"
        )}
      </button>
    </form>
  );
}
