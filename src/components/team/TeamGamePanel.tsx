"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Loader2, UserPlus } from "lucide-react";
import { setTeamAnswer, nudgeTeam, askSubs, type GameHeadcount } from "@/app/team-actions";
import type { TeamAnswer } from "@/lib/teams";
import { HeadcountBar } from "./HeadcountBar";

const GROUPS: { key: TeamAnswer; label: string; tone: string }[] = [
  { key: "in", label: "In", tone: "text-green-700" },
  { key: "maybe", label: "Maybe", tone: "text-neutral-600" },
  { key: "none", label: "No answer", tone: "text-neutral-600" },
  { key: "out", label: "Out", tone: "text-neutral-500" },
];

/** Team game/practice block on the event page: your In/Maybe/Out, the headcount, and captain tools. */
export function TeamGamePanel({ eventId, data }: { eventId: string; data: GameHeadcount }) {
  const router = useRouter();
  const [mine, setMine] = useState<TeamAnswer>(data.mine);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function answer(next: "in" | "maybe" | "out") {
    if (!data.myCardId || busy) return;
    const prev = mine;
    setMine(next);
    setBusy(next);
    const res = await setTeamAnswer(data.myCardId, next);
    setBusy(null);
    if (!res.ok) {
      setMine(prev);
      setNote(res.error ?? "Couldn't save.");
    }
    router.refresh();
  }

  async function run(kind: "nudge" | "subs") {
    if (busy) return;
    setBusy(kind);
    setNote(null);
    const res = kind === "nudge" ? await nudgeTeam(eventId) : await askSubs(eventId);
    setBusy(null);
    if (!res.ok) setNote(res.error ?? "Something went wrong.");
    else
      setNote(
        kind === "nudge"
          ? `Nudged ${res.count} ${res.count === 1 ? "person" : "people"} — it's at the top of their Today.`
          : `Asked ${res.count} ${res.count === 1 ? "sub" : "subs"}.`,
      );
    router.refresh();
  }

  const isPractice = data.kind === "practice";
  const seg = "min-h-[46px] rounded-xl text-[15px] font-semibold transition disabled:opacity-60";
  const noAnswer = data.headcount.none;

  return (
    <section className="space-y-4">
      <Link href={`/team/${data.teamId}`} className="inline-flex text-[13px] font-semibold text-fuchsia-800 hover:underline">
        {data.teamName} · {isPractice ? "Practice" : "Game"}
      </Link>

      {data.myCardId && (
        <div className="space-y-2">
          <h2 className="text-[13px] font-semibold text-neutral-600">Are you in?</h2>
          <div role="group" aria-label="Your answer" className="grid grid-cols-[1.4fr_1fr_1fr] gap-1.5 rounded-2xl bg-neutral-200/60 p-1">
            {(["in", "maybe", "out"] as const).map((k) => {
              const on = mine === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  disabled={!!busy}
                  onClick={() => answer(k)}
                  className={`${seg} ${
                    on
                      ? k === "in"
                        ? "bg-fuchsia-700 text-white shadow-sm"
                        : "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-700 hover:bg-white/60"
                  }`}
                >
                  {busy === k ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : k === "in" ? "I'm in" : k === "maybe" ? "Maybe" : "Out"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-4 rounded-[18px] bg-white p-4 shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
        <HeadcountBar h={data.headcount} />

        {data.canManage && (noAnswer > 0 || data.subsAvailable > 0) && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => run("nudge")}
              disabled={!!busy || noAnswer === 0}
              className="flex h-[46px] items-center justify-center gap-2 rounded-xl bg-fuchsia-700 text-[14px] font-semibold text-white transition hover:bg-fuchsia-800 disabled:opacity-50"
            >
              {busy === "nudge" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              Nudge {noAnswer || ""}
            </button>
            <button
              type="button"
              onClick={() => run("subs")}
              disabled={!!busy || data.subsAvailable === 0}
              className="flex h-[46px] items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white text-[14px] font-semibold text-neutral-900 transition hover:bg-neutral-50 disabled:opacity-50"
            >
              {busy === "subs" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Ask subs{data.subsAvailable ? ` (${data.subsAvailable})` : ""}
            </button>
          </div>
        )}
        {note && <p className="text-[13px] font-medium text-neutral-600">{note}</p>}

        <div className="divide-y divide-neutral-100 border-t border-neutral-100">
          {GROUPS.map((g) => {
            const people = data.entries.filter((e) => e.answer === g.key);
            if (people.length === 0) return null;
            return (
              <div key={g.key} className="py-3">
                <p className={`text-[12px] font-bold uppercase tracking-wide ${g.tone}`}>
                  {g.label} · {people.length}
                </p>
                <p className={`mt-1 text-[14px] font-medium ${g.key === "out" ? "text-neutral-500" : "text-neutral-900"}`}>
                  {people.map((p) => `${p.name}${p.isSub ? " (sub)" : ""}`).join(", ")}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
