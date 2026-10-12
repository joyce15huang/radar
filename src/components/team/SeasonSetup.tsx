"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Repeat, Plus, ClipboardPaste } from "lucide-react";
import { parseSeasonText, addTeamEvents, addWeeklyPractice, type NewTeamEvent } from "@/app/team-actions";
import type { ParsedEvent } from "@/lib/parse/schedule";
import { clientTimeZone, isoFromLocal } from "@/lib/localDateTime";
import { fieldCls } from "./CreateTeamForm";

const card = "rounded-[18px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]";
const cap = "text-[13px] font-semibold text-neutral-600";
const primary =
  "flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-700 text-[16px] font-bold text-white transition hover:bg-fuchsia-800 disabled:opacity-50";

/** Season setup: paste the league schedule, add a weekly practice, or add one game. */
export function SeasonSetup({ teamId, teamName, hasEvents }: { teamId: string; teamName: string; hasEvents: boolean }) {
  const router = useRouter();
  const [added, setAdded] = useState<string | null>(null);
  const done = (msg: string) => {
    setAdded(msg);
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900">
          {hasEvents ? "Add to the season" : "Set up the season"}
        </h1>
        <p className="mt-1 text-[15px] text-neutral-600">Everything you add lands on every player&rsquo;s calendar.</p>
      </header>

      {added && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-green-100 px-4 py-3">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-green-800">
            <Check className="h-4 w-4" /> {added}
          </p>
          <button
            type="button"
            onClick={() => router.push(`/team/${teamId}`)}
            className="shrink-0 text-[14px] font-bold text-green-900 hover:underline"
          >
            Back to team
          </button>
        </div>
      )}

      <PasteSchedule teamId={teamId} teamName={teamName} onAdded={done} />
      <WeeklyPractice teamId={teamId} onAdded={done} />
      <OneGame teamId={teamId} onAdded={done} />
    </div>
  );
}

/* ----------------------------- paste schedule ----------------------------- */

function PasteSchedule({ teamId, teamName, onAdded }: { teamId: string; teamName: string; onAdded: (m: string) => void }) {
  const [text, setText] = useState("");
  const [games, setGames] = useState<ParsedEvent[] | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await parseSeasonText(teamId, text);
    setBusy(false);
    if (!res.ok || !res.events) return setError(res.error ?? "Couldn't read that.");
    setGames(res.events);
    setKeep(res.events.map(() => true));
  }

  async function add() {
    if (!games || busy) return;
    const items: NewTeamEvent[] = games
      .filter((_, i) => keep[i])
      .map((g) => ({
        title: g.title,
        startsAt: g.startsAt as string,
        hasTime: g.hasTime,
        location: g.location,
        kind: "game",
        opponent: g.opponent,
        homeAway: g.homeAway,
      }));
    if (items.length === 0) return;
    setBusy(true);
    setError(null);
    const res = await addTeamEvents(teamId, items);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't add those.");
    setGames(null);
    setText("");
    onAdded(`Added ${res.count} ${res.count === 1 ? "game" : "games"}.`);
  }

  const count = keep.filter(Boolean).length;
  return (
    <section className="space-y-3">
      <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">Paste the league schedule</h2>
      {!games ? (
        <div className={`${card} space-y-3 p-4`}>
          <label className="block space-y-1.5">
            <span className={cap}>From the league email or website</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder={`Wk4  10/13  8:00p  Kezar F3  ${teamName} v Mission Mavericks\nWk5  10/20  9:00p  Kezar F1  Golden Gate Utd v ${teamName}`}
              className="w-full resize-y rounded-xl border border-neutral-200 bg-white px-3.5 py-3 font-mono text-[13px] leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            />
          </label>
          <p className="text-[12px] text-neutral-500">
            Only {teamName}&rsquo;s games are kept. You&rsquo;ll check them before anything is added.
          </p>
          {error && <p className="text-[13px] font-medium text-rose-700">{error}</p>}
          <button type="button" onClick={read} disabled={busy || text.trim().length < 8} className={primary}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
            Find our games
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[14px] font-medium text-neutral-600">
            Found {games.length} {games.length === 1 ? "game" : "games"} — untick any that are wrong.
          </p>
          <ul className={`${card} divide-y divide-neutral-100`}>
            {games.map((g, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={keep[i]}
                    onChange={(e) => setKeep((k) => k.map((v, j) => (j === i ? e.target.checked : v)))}
                    className="h-5 w-5 shrink-0 accent-[#4F6641]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[15px] font-semibold ${keep[i] ? "text-neutral-900" : "text-neutral-400 line-through"}`}>
                      {g.title}
                    </span>
                    <span className="block truncate text-[13px] text-neutral-500">
                      {[g.when, g.location, g.homeAway ? (g.homeAway === "home" ? "Home" : "Away") : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {error && <p className="text-[13px] font-medium text-rose-700">{error}</p>}
          <button type="button" onClick={add} disabled={busy || count === 0} className={primary}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Add {count} {count === 1 ? "game" : "games"}
          </button>
          <button
            type="button"
            onClick={() => setGames(null)}
            className="mx-auto block text-[14px] font-semibold text-neutral-500 hover:text-neutral-800"
          >
            Edit the text
          </button>
        </div>
      )}
    </section>
  );
}

/* ----------------------------- weekly practice ---------------------------- */

function WeeklyPractice({ teamId, onAdded }: { teamId: string; onAdded: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Practice");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [until, setUntil] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const first = date && time ? isoFromLocal(date, time, clientTimeZone()) : null;
    if (!first || !until) return setError("Pick the first practice and the last week.");
    setBusy(true);
    setError(null);
    const res = await addWeeklyPractice(teamId, { title, firstStartsAt: first, untilYmd: until, location });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't add practice.");
    setOpen(false);
    onAdded(`Added ${res.count} practices.`);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${card} flex w-full items-center gap-3.5 px-4 py-3.5 text-left`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100">
          <Repeat className="h-[19px] w-[19px] text-green-700" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-neutral-900">Add a weekly practice</span>
          <span className="block text-[13px] text-neutral-500">Same day and time every week</span>
        </span>
        <Plus className="h-4 w-4 text-neutral-400" />
      </button>
    );
  }
  return (
    <form onSubmit={save} className={`${card} space-y-4 p-4`}>
      <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">Weekly practice</h2>
      <label className="block space-y-1.5">
        <span className={cap}>Name</span>
        <input className={fieldCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className={cap}>First one</span>
          <input type="date" className={fieldCls} value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="block space-y-1.5">
          <span className={cap}>Time</span>
          <input type="time" className={fieldCls} value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className={cap}>Repeat every week until</span>
        <input type="date" className={fieldCls} value={until} min={date || undefined} onChange={(e) => setUntil(e.target.value)} required />
      </label>
      <label className="block space-y-1.5">
        <span className={cap}>Where</span>
        <input className={fieldCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Garfield Square" maxLength={120} />
      </label>
      {error && <p className="text-[13px] font-medium text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className={primary}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add practices
      </button>
      <button type="button" onClick={() => setOpen(false)} className="mx-auto block text-[14px] font-semibold text-neutral-500">
        Cancel
      </button>
    </form>
  );
}

/* -------------------------------- one game -------------------------------- */

function OneGame({ teamId, onAdded }: { teamId: string; onAdded: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [opponent, setOpponent] = useState("");
  const [homeAway, setHomeAway] = useState<"home" | "away">("home");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("20:00");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const startsAt = date ? isoFromLocal(date, time || null, clientTimeZone()) : null;
    if (!startsAt) return setError("Pick a date.");
    const opp = opponent.trim();
    setBusy(true);
    setError(null);
    const res = await addTeamEvents(teamId, [
      {
        title: opp ? `${homeAway === "away" ? "at" : "vs."} ${opp}` : "Game",
        startsAt,
        hasTime: !!time,
        location,
        kind: "game",
        opponent: opp || undefined,
        homeAway,
      },
    ]);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't add the game.");
    setOpen(false);
    setOpponent("");
    setDate("");
    onAdded("Added 1 game.");
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${card} flex w-full items-center gap-3.5 px-4 py-3.5 text-left`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
          <Plus className="h-[19px] w-[19px] text-neutral-700" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-neutral-900">Add one game</span>
          <span className="block text-[13px] text-neutral-500">A playoff, a friendly, a makeup game</span>
        </span>
      </button>
    );
  }
  return (
    <form onSubmit={save} className={`${card} space-y-4 p-4`}>
      <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">One game</h2>
      <label className="block space-y-1.5">
        <span className={cap}>Opponent</span>
        <input className={fieldCls} value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Mission Mavericks" maxLength={60} />
      </label>
      <div role="group" aria-label="Home or away" className="grid grid-cols-2 gap-1.5 rounded-xl bg-neutral-100 p-1">
        {(["home", "away"] as const).map((h) => (
          <button
            key={h}
            type="button"
            aria-pressed={homeAway === h}
            onClick={() => setHomeAway(h)}
            className={`h-10 rounded-lg text-[14px] font-semibold ${homeAway === h ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
          >
            {h === "home" ? "Home" : "Away"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className={cap}>Date</span>
          <input type="date" className={fieldCls} value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="block space-y-1.5">
          <span className={cap}>Time</span>
          <input type="time" className={fieldCls} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className={cap}>Where</span>
        <input className={fieldCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kezar, Field 3" maxLength={120} />
      </label>
      {error && <p className="text-[13px] font-medium text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className={primary}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add game
      </button>
      <button type="button" onClick={() => setOpen(false)} className="mx-auto block text-[14px] font-semibold text-neutral-500">
        Cancel
      </button>
    </form>
  );
}
