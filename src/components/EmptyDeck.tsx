"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Sparkles, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { generateMyDeck, type GenState } from "@/app/deck-actions";

/**
 * Shown on the Today tab when there are zero `pending` cards on load — distinct
 * from the in-session "all caught up" celebration. Offers to generate a deck now.
 */
export function EmptyDeck({ hasPrompt }: { hasPrompt: boolean }) {
  const [state, action, pending] = useActionState<GenState, FormData>(generateMyDeck, {
    status: "idle",
  });

  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
        <Sparkles className="h-7 w-7" strokeWidth={2} />
      </div>

      <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
        {hasPrompt ? "Your deck is empty right now" : "Let’s build your first deck"}
      </h2>
      <p className="mt-2 max-w-sm text-[0.95rem] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {hasPrompt
          ? "Nothing pending today. Generate a fresh deck from your interests now, or check your Library and Calendar."
          : "Tell the scout what you care about — in plain English — and it’ll assemble a calm, finite briefing just for you."}
      </p>

      {hasPrompt ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <form action={action}>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Building your deck…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" /> Generate today&rsquo;s deck
                </>
              )}
            </button>
          </form>
          {pending && (
            <span className="text-sm text-neutral-400 dark:text-neutral-500">
              Running the scout live — about 15–25 seconds.
            </span>
          )}
          <Link
            href="/profile"
            className="text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            Edit interests
          </Link>
          {state.status === "error" && (
            <p className="max-w-sm text-sm text-rose-600 dark:text-rose-400">{state.message}</p>
          )}
          {state.status === "done" && state.generated === 0 && (
            <p className="max-w-sm text-sm text-amber-600 dark:text-amber-400">
              The scout came back empty — try broadening your interests.
            </p>
          )}
        </div>
      ) : (
        <Link
          href="/profile"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Set your interests
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
        </Link>
      )}
    </div>
  );
}
