"use client";

import { useActionState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Plus } from "lucide-react";
import { generateMoreDeck, type GenState } from "@/app/deck-actions";

/**
 * The definitive completion state. Calm and roomy — the "you can put the phone
 * down now" moment. Summarizes where cleared cards went (Library / Calendar) and
 * offers a low-key way to pull a few more opportunities beyond the daily cap.
 */
export function AllCaughtUp({ saved, accepted }: { saved: number; accepted: number }) {
  const [state, action, pending] = useActionState<GenState, FormData>(generateMoreDeck, {
    status: "idle",
  });

  // On a successful top-up, reload so the freshly inserted cards render.
  useEffect(() => {
    if (state.status === "done" && (state.generated ?? 0) > 0) {
      window.location.reload();
    }
  }, [state]);

  const bits: string[] = [];
  if (saved > 0) bits.push(`saved ${saved} to your Library`);
  if (accepted > 0) bits.push(`added ${accepted} to your Calendar`);
  const summary = bits.length > 0 ? `You ${bits.join(" and ")}. ` : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center px-6 py-24 text-center"
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20"
      >
        <Check className="h-8 w-8" strokeWidth={2.5} />
      </motion.div>

      <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
        You&rsquo;re all caught up for today.
      </h2>
      <p className="mt-2 max-w-xs text-[0.95rem] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {summary}
        Nothing more to see. Come back tomorrow morning for a fresh deck.
      </p>

      <form action={action} className="mt-6">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Finding more…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Find more opportunities
            </>
          )}
        </button>
      </form>

      {state.status === "done" && (state.generated ?? 0) === 0 && (
        <p className="mt-3 text-sm text-neutral-400 dark:text-neutral-500">
          Nothing new to add right now — check back tomorrow.
        </p>
      )}
      {state.status === "error" && (
        <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{state.message}</p>
      )}
    </motion.div>
  );
}
