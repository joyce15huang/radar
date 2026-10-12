"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createTeam } from "@/app/team-actions";

export const fieldCls =
  "h-12 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-[15px] text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200";

/** Name a team (and optionally how many it takes to play), then land on its page. */
export function CreateTeamForm({ firstTeam }: { firstTeam: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(firstTeam);
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [min, setMin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await createTeam({ name, blurb, minPlayers: min ? Number(min) : null });
    if (!res.ok || !res.teamId) {
      setBusy(false);
      setError(res.error ?? "Couldn't create the team.");
      return;
    }
    router.push(`/team/${res.teamId}/season`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-neutral-300 text-[15px] font-semibold text-neutral-900 transition hover:bg-white/60"
      >
        <Plus className="h-4 w-4" /> Start a team
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-[18px] bg-white p-4 shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
      <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">{firstTeam ? "Start your team" : "New team"}</h2>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-semibold text-neutral-600">Team name</span>
        <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dolores FC" maxLength={60} required />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-semibold text-neutral-600">One line about it (optional)</span>
        <input className={fieldCls} value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Coed 7v7 · Tuesdays" maxLength={80} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-semibold text-neutral-600">Players needed to play a game (optional)</span>
        <input
          className={fieldCls}
          value={min}
          onChange={(e) => setMin(e.target.value.replace(/\D/g, "").slice(0, 2))}
          inputMode="numeric"
          placeholder="8"
        />
      </label>
      {error && <p className="text-[13px] font-medium text-rose-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-700 text-[16px] font-bold text-white transition hover:bg-fuchsia-800 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Create team
      </button>
    </form>
  );
}
