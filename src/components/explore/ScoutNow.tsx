"use client";

import { useActionState } from "react";
import { Loader2, Search } from "lucide-react";
import { generateMyDeck, type GenState } from "@/app/deck-actions";

/** Ask the scout to look on the web now (your saved locations and interests). */
export function ScoutNow() {
  const [state, action, pending] = useActionState<GenState, FormData>(generateMyDeck, { status: "idle" });
  return (
    <form action={action} className="space-y-2 text-center">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 text-[14px] font-semibold text-neutral-900 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {pending ? "Looking…" : "Look on the web for me"}
      </button>
      {state.status === "error" && <p className="text-[13px] font-medium text-rose-700">{state.message}</p>}
      {state.status === "done" && <p className="text-[13px] font-medium text-neutral-600">{state.generated ? `Found ${state.generated}.` : "Nothing new right now."}</p>}
    </form>
  );
}
