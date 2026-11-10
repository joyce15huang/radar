"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CalendarPlus,
  Check,
  ChevronRight,
  Copy,
  DollarSign,
  Link2,
  Loader2,
  Lock,
  MessageCircle,
  ArrowUpRight,
  Settings2,
  UserPlus,
  X,
} from "lucide-react";
import {
  addTeamMember,
  getTeamLinks,
  nudgeTeam,
  removeTeamMember,
  setDuesPaid,
  setMemberRole,
  updateTeam,
  updateTeamBoard,
} from "@/app/team-actions";
import { canManage, dollars, type TeamDetail, type TeamEventSummary, type TeamRole } from "@/lib/teams";
import { HeadcountBar } from "./HeadcountBar";
import { chatClosesAt } from "@/lib/chat";
import { fieldCls } from "./CreateTeamForm";

const card = "rounded-[18px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]";
const ROLE_LABEL: Record<TeamRole, string> = {
  captain: "Captain",
  cocaptain: "Co-captain",
  player: "Player",
  sub: "Sub",
};

type Threads = Record<string, { count: number; last: { author: string; body: string } | null }>;

export function TeamHome({ team, me, tz, threads }: { team: TeamDetail; me: string; tz: string; threads: Threads }) {
  const router = useRouter();
  const manager = canManage(team.myRole);
  const [next, ...later] = team.upcoming;
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-7">
      <header className="flex items-center gap-3.5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutral-900 text-[18px] font-bold text-white">
          {monogram(team.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[28px] font-bold leading-tight tracking-tight text-neutral-900">{team.name}</h1>
          <p className="truncate text-[14px] font-medium text-neutral-500">
            {[team.blurb, `${team.members.filter((m) => m.role !== "sub").length} players`].filter(Boolean).join(" · ")}
          </p>
        </div>
        {manager && (
          <button
            type="button"
            aria-label="Team settings"
            onClick={() => setEditing((v) => !v)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-200/60"
          >
            {editing ? <X className="h-5 w-5" /> : <Settings2 className="h-5 w-5" />}
          </button>
        )}
      </header>

      {editing && <TeamSettings team={team} onDone={() => setEditing(false)} />}

      {next ? (
        <NextUp ev={next} manager={manager} tz={tz} />
      ) : (
        <section className={`${card} p-5 text-center`}>
          <p className="text-[15px] font-semibold text-neutral-900">Nothing on the schedule yet</p>
          <p className="mt-1 text-[14px] text-neutral-500">
            {manager ? "Paste the league schedule and add your practice night." : "Your captain hasn't added games yet."}
          </p>
          {manager && (
            <Link
              href={`/team/${team.id}/season`}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-fuchsia-700 px-4 text-[14px] font-semibold text-white transition hover:bg-fuchsia-800"
            >
              <CalendarPlus className="h-4 w-4" /> Set up the season
            </Link>
          )}
        </section>
      )}

      {(later.length > 0 || manager) && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">
              Season
              {team.pastCount > 0 && (
                <span className="ml-1.5 text-[14px] font-medium text-neutral-500">{team.pastCount} played</span>
              )}
            </h2>
            {manager && (
              <Link href={`/team/${team.id}/season`} className="text-[14px] font-semibold text-fuchsia-800 hover:underline">
                Add games
              </Link>
            )}
          </div>
          {later.length > 0 && (
            <ul className={`${card} divide-y divide-neutral-100`}>
              {later.slice(0, 12).map((e) => (
                <li key={e.id}>
                  <EventRow ev={e} tz={tz} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <TeamBoard team={team} manager={manager} />

      <GameThreads team={team} tz={tz} threads={threads} />

      {team.chatUrl && (
        <a
          href={team.chatUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${card} flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-neutral-50`}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100">
            <MessageCircle className="h-[19px] w-[19px] text-green-700" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-neutral-900">Team group chat</span>
            <span className="block truncate text-[13px] text-neutral-500">Opens {hostLabel(team.chatUrl)} — for everything else</span>
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-neutral-500" />
        </a>
      )}

      {team.duesCents ? <Dues team={team} me={me} manager={manager} /> : null}

      <Roster team={team} me={me} manager={manager} onChange={() => router.refresh()} />

      <ShareLinks teamId={team.id} />

      {team.myRole !== "captain" && <LeaveTeam teamId={team.id} me={me} />}
    </div>
  );
}

/* --------------------------------- next up -------------------------------- */

function NextUp({ ev, manager, tz }: { ev: TeamEventSummary; manager: boolean; tz: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const isPractice = ev.kind === "practice";

  async function nudge() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const res = await nudgeTeam(ev.id);
    setBusy(false);
    setNote(res.ok ? `Nudged ${res.count} — it's at the top of their Today.` : (res.error ?? "Couldn't nudge."));
    router.refresh();
  }

  return (
    <section className={`${card} space-y-4 p-[18px]`}>
      <Link href={`/event/${ev.id}`} className="flex items-start justify-between gap-3">
        <span className="min-w-0 space-y-0.5">
          <span className="block text-[12px] font-bold uppercase tracking-wide text-fuchsia-800">
            Next {isPractice ? "practice" : "game"}
            {relativeDay(ev.startsAt, tz) ? ` · ${relativeDay(ev.startsAt, tz)}` : ""}
          </span>
          <span className="block text-[20px] font-bold leading-tight tracking-tight text-neutral-900">{ev.title}</span>
          <span className="block text-[14px] font-medium text-neutral-500">
            {[ev.when, ev.location].filter(Boolean).join(" · ")}
          </span>
        </span>
        {ev.homeAway && (
          <span className="mt-0.5 shrink-0 rounded-lg bg-neutral-100 px-2.5 py-1 text-[12px] font-bold text-neutral-600">
            {ev.homeAway === "home" ? "Home" : "Away"}
          </span>
        )}
      </Link>

      <HeadcountBar h={ev.headcount} />

      <div className="grid grid-cols-2 gap-2">
        {manager && ev.headcount.none > 0 ? (
          <button
            type="button"
            onClick={nudge}
            disabled={busy}
            className="flex h-[46px] items-center justify-center gap-2 rounded-xl bg-fuchsia-700 text-[14px] font-semibold text-white transition hover:bg-fuchsia-800 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            Nudge {ev.headcount.none}
          </button>
        ) : (
          <span className="flex h-[46px] items-center justify-center rounded-xl bg-neutral-100 text-[14px] font-semibold text-neutral-700">
            You&rsquo;re {ev.mine === "none" ? "not answered" : ev.mine}
          </span>
        )}
        <Link
          href={`/event/${ev.id}`}
          className="flex h-[46px] items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white text-[14px] font-semibold text-neutral-900 transition hover:bg-neutral-50"
        >
          {manager ? "Who's in · subs" : "Answer"} <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {note && <p className="text-[13px] font-medium text-neutral-600">{note}</p>}
    </section>
  );
}

function EventRow({ ev, tz }: { ev: TeamEventSummary; tz: string }) {
  const d = ev.startsAt ? new Date(ev.startsAt) : null;
  const dow = d ? d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz }).toUpperCase() : "";
  const day = d ? d.toLocaleDateString("en-US", { day: "numeric", timeZone: tz }) : "";
  const mineLabel = ev.mine === "in" ? "You're in" : ev.mine === "maybe" ? "Maybe" : ev.mine === "out" ? "Out" : null;
  return (
    <Link href={`/event/${ev.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-neutral-50">
      <span className="flex w-11 shrink-0 flex-col items-center">
        <span className="text-[10px] font-bold tracking-wide text-neutral-500">{dow}</span>
        <span className="text-[17px] font-bold text-neutral-900">{day}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-neutral-900">{ev.title}</span>
        <span className="block truncate text-[13px] text-neutral-500">
          {[ev.allDay ? null : timeOf(ev.startsAt, tz), ev.location, ev.homeAway ? (ev.homeAway === "home" ? "Home" : "Away") : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="shrink-0 text-right text-[12px] font-semibold text-neutral-500">
        {ev.headcount.in} in
        {mineLabel && <span className="block text-[11px] font-medium text-neutral-400">{mineLabel}</span>}
      </span>
    </Link>
  );
}

/* ------------------------------- notes board ------------------------------ */

function TeamBoard({ team, manager }: { team: TeamDetail; manager: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(team.notes ?? "");
  const [chatUrl, setChatUrl] = useState(team.chatUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!team.notes && !manager) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await updateTeamBoard(team.id, { notes, chatUrl });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't save.");
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">Team notes</h2>
        {manager && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[14px] font-semibold text-fuchsia-800 hover:underline">
            {team.notes ? "Edit" : "Add"}
          </button>
        )}
      </div>
      {editing ? (
        <form onSubmit={save} className={`${card} space-y-3 p-4`}>
          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold text-neutral-600">Pinned for everyone</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder={"Jersey: white home, blue away\nArrive 15 min early\nParking: Kezar lot off Frederick St"}
              className="w-full resize-y rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-[15px] leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold text-neutral-600">Your team&rsquo;s group chat link (optional)</span>
            <input className={fieldCls} value={chatUrl} onChange={(e) => setChatUrl(e.target.value)} placeholder="chat.whatsapp.com/…" inputMode="url" />
          </label>
          {error && <p className="text-[13px] font-medium text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-[15px] font-semibold text-white disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-xl px-4 text-[14px] font-semibold text-neutral-600">
              Cancel
            </button>
          </div>
        </form>
      ) : team.notes ? (
        <div className={`${card} space-y-2 p-4`}>
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-neutral-900">{team.notes}</p>
          {team.notesBy && <p className="text-[12px] font-medium text-neutral-500">Updated by {team.notesBy}</p>}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-4 text-[14px] text-neutral-500">
          Pin what everyone keeps asking — jersey colours, where to park, the dues link.
        </p>
      )}
    </section>
  );
}

/* ------------------------------- game threads ----------------------------- */

function GameThreads({ team, tz, threads }: { team: TeamDetail; tz: string; threads: Threads }) {
  const rows = [
    ...team.upcoming.slice(0, 4).map((e) => ({ e, past: false })),
    ...team.recent.map((e) => ({ e, past: true })),
  ];
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">Game threads</h2>
      <ul className={`${card} divide-y divide-neutral-100`}>
        {rows.map(({ e, past }) => {
          const t = threads[e.id];
          const d = e.startsAt ? new Date(e.startsAt) : null;
          const rel = relativeDay(e.startsAt, tz);
          const closesAt = chatClosesAt(e.startsAt);
          const closed = past && !!closesAt && Date.parse(closesAt) < Date.now();
          return (
            <li key={e.id}>
              <Link href={`/event/${e.id}#chat`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-neutral-50">
                <span className="flex w-11 shrink-0 flex-col items-center">
                  <span className={`text-[10px] font-bold tracking-wide ${rel === "Today" ? "text-fuchsia-800" : past ? "text-neutral-400" : "text-neutral-500"}`}>
                    {rel === "Today" ? "TODAY" : d ? d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz }).toUpperCase() : ""}
                  </span>
                  <span className={`text-[17px] font-bold ${past ? "text-neutral-400" : "text-neutral-900"}`}>
                    {d ? d.toLocaleDateString("en-US", { day: "numeric", timeZone: tz }) : ""}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[15px] font-semibold ${past ? "text-neutral-500" : "text-neutral-900"}`}>{e.title}</span>
                  <span className={`block truncate text-[13px] ${past ? "text-neutral-400" : "text-neutral-500"}`}>
                    {closed
                      ? `Closed · ${t?.count ?? 0} ${(t?.count ?? 0) === 1 ? "message" : "messages"}`
                      : t?.last
                        ? `${t.last.author}: ${t.last.body}`
                        : "No messages"}
                  </span>
                </span>
                {closed && <Lock className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-label="Closed" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------------------------- dues ---------------------------------- */

function Dues({ team, me, manager }: { team: TeamDetail; me: string; manager: boolean }) {
  const router = useRouter();
  const payers = team.members.filter((m) => m.role !== "sub");
  const paid = payers.filter((m) => m.duesPaid).length;
  const mine = team.members.find((m) => m.id === me);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function toggle(memberId: string, next: boolean) {
    setBusy(memberId);
    await setDuesPaid(team.id, memberId, next);
    setBusy(null);
    router.refresh();
  }

  return (
    <section className={`${card} overflow-hidden`}>
      <div className="flex items-center gap-3.5 px-4 py-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100">
          <DollarSign className="h-[19px] w-[19px] text-amber-700" />
        </span>
        <button type="button" onClick={() => manager && setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="block text-[15px] font-semibold text-neutral-900">Season dues · {dollars(team.duesCents ?? 0)}</span>
          <span className="block text-[13px] text-neutral-500">
            {paid} of {payers.length} paid{team.venmoId ? ` · Venmo @${team.venmoId}` : ""}
          </span>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-neutral-200">
            <span className="block h-full rounded-full bg-neutral-900" style={{ width: `${payers.length ? (paid / payers.length) * 100 : 0}%` }} />
          </span>
        </button>
        {mine && mine.role !== "sub" && (
          <button
            type="button"
            onClick={() => toggle(me, !mine.duesPaid)}
            disabled={busy === me}
            aria-pressed={mine.duesPaid}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold transition ${
              mine.duesPaid ? "bg-green-100 text-green-800" : "border border-neutral-300 bg-white text-neutral-900"
            }`}
          >
            {busy === me ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mine.duesPaid && <Check className="h-3.5 w-3.5" />}
            {mine.duesPaid ? "Paid" : "I paid"}
          </button>
        )}
      </div>
      {team.venmoId && mine && !mine.duesPaid && mine.role !== "sub" && (
        <a
          href={`https://venmo.com/${encodeURIComponent(team.venmoId)}?txn=pay&amount=${((team.duesCents ?? 0) / 100).toFixed(2)}&note=${encodeURIComponent(`${team.name} dues`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block border-t border-neutral-100 px-4 py-3 text-[14px] font-semibold text-fuchsia-800 hover:bg-neutral-50"
        >
          Pay @{team.venmoId} on Venmo
        </a>
      )}
      {manager && open && (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
          {payers.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[14px] font-medium text-neutral-900">{m.name}</span>
              <button
                type="button"
                onClick={() => toggle(m.id, !m.duesPaid)}
                disabled={busy === m.id}
                className={`h-8 rounded-lg px-2.5 text-[12px] font-bold ${
                  m.duesPaid ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {m.duesPaid ? "Paid" : "Not yet"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------- roster --------------------------------- */

function Roster({ team, me, manager, onChange }: { team: TeamDetail; me: string; manager: boolean; onChange: () => void }) {
  const [adding, setAdding] = useState<"player" | "sub" | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const players = team.members.filter((m) => m.role !== "sub");
  const subs = team.members.filter((m) => m.role === "sub");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!adding || busy) return;
    setBusy(true);
    setError(null);
    const res = await addTeamMember(team.id, handle, adding);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't add them.");
    setHandle("");
    setAdding(null);
    onChange();
  }

  async function changeRole(memberId: string, role: TeamRole | "remove") {
    setMenu(null);
    setError(null);
    const res = role === "remove" ? await removeTeamMember(team.id, memberId) : await setMemberRole(team.id, memberId, role);
    if (!res.ok) setError(res.error ?? "Couldn't change that.");
    onChange();
  }

  const row = (m: TeamDetail["members"][number]) => (
    <li key={m.id} className="relative flex items-center gap-3 px-4 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[13px] font-bold text-neutral-800">
        {m.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-neutral-900">
          {m.name}
          {m.id === me && <span className="font-medium text-neutral-500"> (you)</span>}
        </span>
        {m.username && <span className="block truncate text-[12px] text-neutral-500">@{m.username}</span>}
      </span>
      {m.role !== "player" && (
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">{ROLE_LABEL[m.role]}</span>
      )}
      {manager && m.id !== me && (
        <>
          <button
            type="button"
            aria-label={`Change ${m.name}'s role`}
            onClick={() => setMenu(menu === m.id ? null : m.id)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
          >
            <ChevronRight className={`h-4 w-4 transition ${menu === m.id ? "rotate-90" : ""}`} />
          </button>
          {menu === m.id && (
            <div className="absolute right-3 top-12 z-10 w-44 overflow-hidden rounded-xl bg-white py-1 shadow-[0_12px_32px_rgba(40,25,20,0.18)]">
              {(["cocaptain", "player", "sub"] as const)
                .filter((r) => r !== m.role)
                .map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => changeRole(m.id, r)}
                    className="block w-full px-3.5 py-2.5 text-left text-[14px] font-medium text-neutral-900 hover:bg-neutral-50"
                  >
                    Make {ROLE_LABEL[r].toLowerCase()}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => changeRole(m.id, "remove")}
                className="block w-full px-3.5 py-2.5 text-left text-[14px] font-medium text-rose-700 hover:bg-neutral-50"
              >
                Remove from team
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">
          Roster
          <span className="ml-1.5 text-[14px] font-medium text-neutral-500">
            {players.length} {subs.length ? `+ ${subs.length} ${subs.length === 1 ? "sub" : "subs"}` : ""}
          </span>
        </h2>
        {manager && !adding && (
          <button
            type="button"
            onClick={() => setAdding("player")}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-fuchsia-700 px-3 text-[14px] font-semibold text-white transition hover:bg-fuchsia-800"
          >
            <UserPlus className="h-4 w-4" /> Add
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={add} className={`${card} space-y-3 p-4`}>
          <div role="group" aria-label="Add as" className="grid grid-cols-2 gap-1.5 rounded-xl bg-neutral-100 p-1">
            {(["player", "sub"] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={adding === r}
                onClick={() => setAdding(r)}
                className={`h-9 rounded-lg text-[14px] font-semibold ${adding === r ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
              >
                {r === "player" ? "Player" : "Sub"}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-neutral-500">
            {adding === "player" ? "Gets every game and practice." : "Only asked when you're short."} Add friends here —
            everyone else joins from the team link below.
          </p>
          <div className="flex gap-2">
            <input
              className={fieldCls}
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@friend"
              aria-label="Your friend's handle"
              autoFocus
            />
            <button
              type="submit"
              disabled={busy || !handle.trim()}
              className="h-12 shrink-0 rounded-xl bg-neutral-900 px-4 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </button>
          </div>
          <button type="button" onClick={() => setAdding(null)} className="text-[13px] font-semibold text-neutral-500">
            Cancel
          </button>
        </form>
      )}
      {error && <p className="text-[13px] font-medium text-rose-700">{error}</p>}

      <ul className={`${card} divide-y divide-neutral-100`}>{players.map(row)}</ul>
      {subs.length > 0 && (
        <>
          <h3 className="pt-2 text-[12px] font-bold uppercase tracking-wide text-neutral-500">Subs</h3>
          <ul className={`${card} divide-y divide-neutral-100`}>{subs.map(row)}</ul>
        </>
      )}
    </section>
  );
}

/* ------------------------------- share links ------------------------------ */

function ShareLinks({ teamId }: { teamId: string }) {
  const [links, setLinks] = useState<{ join: string; calendar: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<{ join: string; calendar: string } | null> {
    if (links) return links;
    setBusy(true);
    const res = await getTeamLinks(teamId);
    setBusy(false);
    if (!res.ok || !res.join || !res.calendar) {
      setError(res.error ?? "Couldn't make a link.");
      return null;
    }
    const l = { join: res.join, calendar: res.calendar };
    setLinks(l);
    return l;
  }

  async function copy(kind: "join" | "calendar") {
    const l = await load();
    if (!l) return;
    const url = l[kind];
    try {
      if (kind === "join" && navigator.share) {
        await navigator.share({ title: "Join the team", url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(kind);
        setTimeout(() => setCopied(null), 1800);
      }
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }

  const btn =
    "flex min-h-[50px] w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-neutral-50 disabled:opacity-60";
  return (
    <section className={`${card} divide-y divide-neutral-100 overflow-hidden`}>
      <button type="button" onClick={() => copy("join")} disabled={busy} className={btn}>
        <Link2 className="h-[18px] w-[18px] shrink-0 text-neutral-700" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-neutral-900">Share team link</span>
          <span className="block text-[13px] text-neutral-500">Players and subs join from it</span>
        </span>
        {copied === "join" ? <Check className="h-4 w-4 text-green-700" /> : <Copy className="h-4 w-4 text-neutral-400" />}
      </button>
      <button type="button" onClick={() => copy("calendar")} disabled={busy} className={btn}>
        <CalendarPlus className="h-[18px] w-[18px] shrink-0 text-neutral-700" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-neutral-900">Copy calendar link</span>
          <span className="block text-[13px] text-neutral-500">Subscribe in Google or Apple Calendar — stays in sync</span>
        </span>
        {copied === "calendar" ? <Check className="h-4 w-4 text-green-700" /> : <Copy className="h-4 w-4 text-neutral-400" />}
      </button>
      {error && <p className="px-4 py-2.5 text-[13px] font-medium text-rose-700">{error}</p>}
    </section>
  );
}

/* -------------------------------- settings -------------------------------- */

function TeamSettings({ team, onDone }: { team: TeamDetail; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(team.name);
  const [blurb, setBlurb] = useState(team.blurb ?? "");
  const [min, setMin] = useState(team.minPlayers ? String(team.minPlayers) : "");
  const [dues, setDues] = useState(team.duesCents ? String(team.duesCents / 100) : "");
  const [venmo, setVenmo] = useState(team.venmoId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const duesNum = dues ? Math.round(parseFloat(dues) * 100) : null;
    const res = await updateTeam(team.id, {
      name,
      blurb,
      minPlayers: min ? Number(min) : null,
      duesCents: duesNum && Number.isFinite(duesNum) ? duesNum : null,
      venmoId: venmo,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't save.");
    router.refresh();
    onDone();
  }

  const label = "block space-y-1.5";
  const cap = "text-[13px] font-semibold text-neutral-600";
  return (
    <form onSubmit={save} className={`${card} space-y-4 p-4`}>
      <label className={label}>
        <span className={cap}>Team name</span>
        <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </label>
      <label className={label}>
        <span className={cap}>One line about it</span>
        <input className={fieldCls} value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={80} placeholder="Coed 7v7 · Tuesdays" />
      </label>
      <label className={label}>
        <span className={cap}>Players needed to play</span>
        <input className={fieldCls} value={min} inputMode="numeric" onChange={(e) => setMin(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="None" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          <span className={cap}>Season dues ($)</span>
          <input className={fieldCls} value={dues} inputMode="decimal" onChange={(e) => setDues(e.target.value.replace(/[^\d.]/g, "").slice(0, 7))} placeholder="None" />
        </label>
        <label className={label}>
          <span className={cap}>Venmo</span>
          <input className={fieldCls} value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@handle" />
        </label>
      </div>
      {error && <p className="text-[13px] font-medium text-rose-700">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
      </button>
    </form>
  );
}

function LeaveTeam({ teamId, me }: { teamId: string; me: string }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="pt-2 text-center">
      {sure ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await removeTeamMember(teamId, me);
          }}
          className="text-[14px] font-semibold text-rose-700"
        >
          {busy ? "Leaving…" : "Tap again to leave the team"}
        </button>
      ) : (
        <button type="button" onClick={() => setSure(true)} className="text-[14px] font-semibold text-neutral-500 hover:text-neutral-800">
          Leave team
        </button>
      )}
    </div>
  );
}

/* --------------------------------- helpers -------------------------------- */

function hostLabel(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (/whatsapp/.test(h)) return "WhatsApp";
    if (/discord/.test(h)) return "Discord";
    if (/groupme/.test(h)) return "GroupMe";
    if (/slack/.test(h)) return "Slack";
    if (/t\.me|telegram/.test(h)) return "Telegram";
    return h;
  } catch {
    return "your chat";
  }
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

function timeOf(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

/** "Today" / "Tomorrow" / weekday within the week, in the app's timezone. */
function relativeDay(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  const ymd = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: tz });
  const dayMs = (s: string) => Date.parse(`${s}T00:00:00Z`);
  const diff = Math.round((dayMs(ymd(Date.parse(iso))) - dayMs(ymd(Date.now()))) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return new Date(iso).toLocaleDateString("en-US", { weekday: "long", timeZone: tz });
  return null;
}
