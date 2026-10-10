"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Search, Check, CalendarDays, MapPin, Plus, AlignLeft, ArrowRight, Loader2, Car, Receipt, ListChecks } from "lucide-react";
import { listFriendOptions } from "@/app/friends-actions";
import { confirmSchedule } from "@/app/schedule-actions";
import { createDirectEvent, createPoll } from "@/app/poll-actions";
import { setEventModules } from "@/app/module-actions";
import type { FriendOption } from "@/lib/friends";
import { DateTimeField, type DTValue } from "./DateTimeField";
import { clientTimeZone, isoFromLocal, formatWhen, localFromIso } from "@/lib/localDateTime";

const AVATAR_TONES = [
  "bg-fuchsia-700 text-white",
  "bg-amber-500 text-neutral-900",
  "bg-sky-500 text-neutral-900",
  "bg-violet-600 text-white",
  "bg-amber-300 text-neutral-900",
];
const PAY_KEY = "pdd-pay-handles";
/** Optional sections a group plan can start with (event "modules"). */
const EXTRAS = [
  { key: "carpool", label: "Carpool", icon: Car },
  { key: "expenses", label: "Expenses", icon: Receipt },
  { key: "tasks", label: "Tasks", icon: ListChecks },
] as const;

/** Local YYYY-MM-DD for today + n days. */
function dayOffset(n: number, tz: string): string {
  const d = new Date(Date.now() + n * 86_400_000).toISOString();
  return localFromIso(d, tz)?.date ?? d.slice(0, 10);
}
/** "Oct 22" for a YYYY-MM-DD picked from the calendar. */
function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
function chipLabel(ymd: string, i: number): string {
  if (i === 0) return "Today";
  if (i === 1) return "Tomorrow";
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  return `${wd} ${d}`;
}

/**
 * One composer for every new plan: type what it is, tap who's coming (nobody =
 * a private plan for your calendar), pick a day + time or let them vote, then
 * add a place, note or a cost to split if you want.
 */
export function PlanComposer() {
  const router = useRouter();
  const tz = clientTimeZone();
  const days = useMemo(() => Array.from({ length: 3 }, (_, i) => dayOffset(i, tz)), [tz]);

  const [title, setTitle] = useState("");
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const [mode, setMode] = useState<"set" | "vote">("set");
  const [date, setDate] = useState(days[0]);
  const [clock, setClock] = useState("18:00");
  const [allDay, setAllDay] = useState(false);
  const time = allDay ? null : clock || null;
  const customDate = !days.includes(date);
  const [options, setOptions] = useState<DTValue[]>([
    { date: days[1], time: "19:00" },
    { date: days[2], time: "19:00" },
  ]);

  const [location, setLocation] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [showCost, setShowCost] = useState(false);
  const [cost, setCost] = useState("");
  const [venmo, setVenmo] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [zelle, setZelle] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listFriendOptions()
      .then((f) => live && setFriends(f))
      .catch(() => {});
    try {
      const saved = JSON.parse(localStorage.getItem(PAY_KEY) ?? "{}") as { venmo?: string; zelle?: string };
      if (saved.venmo) setVenmo(saved.venmo);
      if (saved.zelle) setZelle(saved.zelle);
    } catch {}
    return () => {
      live = false;
    };
  }, []);

  const group = picked.length > 0;
  const voting = group && mode === "vote";
  const pickedFriends = picked.map((id) => friends.find((f) => f.id === id)).filter(Boolean) as FriendOption[];
  const q = query.trim().toLowerCase().replace(/^@/, "");
  const shown = friends.filter((f) => !q || f.username.toLowerCase().includes(q));

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const tone = (id: string) => AVATAR_TONES[Math.max(0, friends.findIndex((f) => f.id === id)) % AVATAR_TONES.length];

  const startsAt = date ? isoFromLocal(date, time, tz) : null;
  const whenText = startsAt ? formatWhen(startsAt, tz, time !== null) : "";
  const perPerson = parseFloat(cost);
  const feeCents = showCost && Number.isFinite(perPerson) && perPerson > 0 ? Math.round(perPerson * 100) : null;

  const who =
    pickedFriends.length === 1 ? `@${pickedFriends[0].username}` : `${pickedFriends.length} friends`;
  const cta = !group ? "Add to my calendar" : voting ? `Ask ${who} to vote` : `Send to ${who}`;
  const summary = !group
    ? whenText
      ? `${whenText} — just for your calendar`
      : "Pick a day"
    : voting
      ? `They vote on ${options.length} times${feeCents ? ` · $${perPerson} each` : ""}`
      : `${whenText}${feeCents ? ` · $${perPerson} each` : ""} — lands on their calendar to accept`;

  async function submit() {
    if (sending) return;
    if (!title.trim()) return setError("What's the plan? Give it a name.");
    setError(null);
    if (feeCents) {
      try {
        localStorage.setItem(PAY_KEY, JSON.stringify({ venmo: venmo.trim(), zelle: zelle.trim() }));
      } catch {}
    }

    if (voting) {
      const built = options
        .map((o) => {
          const iso = o.date ? isoFromLocal(o.date, o.time, tz) : null;
          return iso ? { label: formatWhen(iso, tz, o.time !== null), startsAt: iso } : null;
        })
        .filter((o): o is { label: string; startsAt: string } => o !== null);
      if (built.length < 2) return setError("Add at least two times to vote on.");
      setSending(true);
      const res = await createPoll({
        title: title.trim(),
        note: note.trim() || undefined,
        location: location.trim() || undefined,
        feeCents,
        venmoId: venmo.trim() || undefined,
        zelleId: zelle.trim() || undefined,
        options: built,
        recipientIds: picked,
      });
      setSending(false);
      if (!res.ok || !res.pollId) return setError(res.error ?? "Couldn't send that.");
      return router.push(`/poll/${res.pollId}`);
    }

    if (!startsAt) return setError("Pick a day.");
    setSending(true);
    if (!group) {
      const res = await confirmSchedule([
        {
          title: title.trim(),
          startsAt,
          hasTime: time !== null,
          location: location.trim() || undefined,
          note: note.trim() || undefined,
        },
      ]);
      setSending(false);
      if (!res.ok) return setError(res.error ?? "Couldn't add that.");
      router.push("/calendar");
      router.refresh();
      return;
    }
    const res = await createDirectEvent({
      title: title.trim(),
      location: location.trim() || undefined,
      note: note.trim() || undefined,
      feeCents,
      venmoId: venmo.trim() || undefined,
      zelleId: zelle.trim() || undefined,
      eventTime: whenText,
      startsAt,
      hasTime: time !== null,
      recipientIds: picked,
    });
    setSending(false);
    if (!res.ok || !res.eventId) return setError(res.error ?? "Couldn't create the event.");
    if (extras.length > 0) await setEventModules(res.eventId, extras);
    router.push(`/event/${res.eventId}`);
  }

  const chip = (on: boolean) =>
    `h-[42px] rounded-xl px-3.5 text-[14px] font-semibold transition active:scale-[0.97] ${
      on ? "bg-neutral-900 text-white" : "bg-neutral-200/70 text-neutral-900 hover:bg-neutral-200"
    }`;

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="grid h-[60px] shrink-0 grid-cols-[44px_1fr_44px] items-center">
        <Link href="/calendar" aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-neutral-200/60">
          <X className="h-5 w-5 text-neutral-900" />
        </Link>
        <span className="text-center text-sm font-semibold text-neutral-500">New plan</span>
        <span />
      </div>

      <div className="flex flex-1 flex-col gap-7 pb-44 pt-1.5">
        <label className="block">
          <span className="text-[13px] font-medium text-neutral-500">What&rsquo;s the plan?</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Dinner at Kin Khao"
            autoFocus
            className="mt-1 w-full bg-transparent text-[30px] font-bold leading-tight tracking-tight text-neutral-900 outline-none placeholder:text-neutral-300"
          />
        </label>

        {/* With */}
        <section className="space-y-3">
          <h2 className="text-[13px] font-semibold text-neutral-500">
            With{group ? ` · ${picked.length}` : ""}
            {!group && <span className="font-normal text-neutral-400"> — nobody yet = just you</span>}
          </h2>
          {searching && (
            <label className="flex h-11 items-center gap-2 rounded-xl bg-white px-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <Search className="h-4 w-4 text-neutral-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search friends"
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-neutral-400"
              />
            </label>
          )}
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            {shown.map((f) => {
              const on = picked.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggle(f.id)}
                  aria-pressed={on}
                  className="flex w-[58px] shrink-0 flex-col items-center gap-1.5"
                >
                  <span
                    className={`relative flex h-[54px] w-[54px] items-center justify-center rounded-full text-[20px] font-bold uppercase ${tone(f.id)} ${
                      on ? "ring-2 ring-neutral-900 ring-offset-[3px] ring-offset-linen" : ""
                    }`}
                  >
                    {f.username.slice(0, 1)}
                    {on && (
                      <span className="absolute -bottom-1 -right-1 flex h-[21px] w-[21px] items-center justify-center rounded-full border-2 border-linen bg-neutral-900">
                        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.6} />
                      </span>
                    )}
                  </span>
                  <span className={`w-full truncate text-center text-[12px] ${on ? "font-bold text-neutral-900" : "font-medium text-neutral-500"}`}>
                    {f.username}
                  </span>
                </button>
              );
            })}
            {!searching && friends.length > 0 && (
              <button type="button" onClick={() => setSearching(true)} className="flex w-[58px] shrink-0 flex-col items-center gap-1.5">
                <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-neutral-200/70">
                  <Search className="h-[19px] w-[19px] text-neutral-800" />
                </span>
                <span className="text-[12px] font-medium text-neutral-500">Search</span>
              </button>
            )}
            {friends.length === 0 && (
              <Link href="/friends" className="text-sm font-medium text-neutral-600 underline underline-offset-4">
                Add friends to invite them
              </Link>
            )}
          </div>
        </section>

        {/* When */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-neutral-500">When</h2>
            {group && (
              <div className="inline-flex rounded-full bg-neutral-200/70 p-[3px]">
                {(["set", "vote"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`h-8 rounded-full px-3 text-[12px] font-semibold ${
                      mode === m ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
                    }`}
                  >
                    {m === "set" ? "Set a time" : "Let them vote"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {voting ? (
            <div className="space-y-3">
              <div className="divide-y divide-neutral-100 rounded-2xl bg-white shadow-[0_8px_24px_rgba(80,50,35,0.06)]">
                {options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <DateTimeField value={o} onChange={(v) => setOptions((p) => p.map((x, j) => (j === i ? v : x)))} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setOptions((p) => p.filter((_, j) => j !== i))}
                      aria-label="Remove time"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setOptions((p) => [...p, { date: dayOffset(p.length + 1, tz), time: "19:00" }])}
                  className="flex h-12 w-full items-center gap-2 px-4 text-[14px] font-semibold text-fuchsia-800"
                >
                  <Plus className="h-4 w-4" /> Add a time
                </button>
              </div>
              <p className="text-[13px] text-neutral-500">Only you see who&rsquo;s free — you pick the winner.</p>
            </div>
          ) : (
            <>
              {/* Day: a few quick picks + a calendar, one row */}
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
                {days.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDate(d)}
                    aria-pressed={date === d}
                    className={`${chip(date === d)} shrink-0`}
                  >
                    {chipLabel(d, i)}
                  </button>
                ))}
                <label
                  className={`relative flex h-[42px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold transition ${
                    customDate ? "bg-neutral-900 text-white" : "bg-neutral-200/70 text-neutral-900"
                  }`}
                >
                  <CalendarDays className="h-[17px] w-[17px]" />
                  {customDate && date ? shortDate(date) : <span className="sr-only">Pick a date</span>}
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                    onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                    aria-label="Pick a date"
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
              </div>

              {/* Time: an editable time + All day, one row */}
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={clock}
                  onChange={(e) => {
                    setClock(e.target.value);
                    setAllDay(false);
                  }}
                  aria-label="Time"
                  className={`h-[42px] w-[132px] rounded-xl px-3 text-[15px] font-semibold outline-none transition ${
                    allDay ? "bg-neutral-200/70 text-neutral-400" : "bg-white text-neutral-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setAllDay((v) => !v)}
                  aria-pressed={allDay}
                  className={chip(allDay)}
                >
                  All day
                </button>
              </div>
              {group && (
                <button
                  type="button"
                  onClick={() => setMode("vote")}
                  className="inline-flex items-center gap-1.5 py-1 text-[14px] font-bold text-fuchsia-800"
                >
                  Not sure? Let them vote on a time <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.6} />
                </button>
              )}
            </>
          )}
        </section>

        {/* Where + extras */}
        <div className="space-y-3">
          <label className="flex h-14 items-center gap-3 rounded-2xl bg-white px-4 shadow-[0_8px_24px_rgba(80,50,35,0.06)]">
            <MapPin className="h-[18px] w-[18px] shrink-0 text-neutral-500" />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Where? (optional)"
              aria-label="Where"
              className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-neutral-400"
            />
          </label>

          {showNote && (
            <label className="relative flex items-start gap-3 rounded-2xl bg-white p-4 pr-12 shadow-[0_8px_24px_rgba(80,50,35,0.06)]">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowNote(false);
                  setNote("");
                }}
                aria-label="Remove note"
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <AlignLeft className="mt-0.5 h-[18px] w-[18px] shrink-0 text-neutral-500" />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                autoFocus
                placeholder="Bring a dish to share…"
                aria-label="Note"
                className="min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-neutral-400"
              />
            </label>
          )}

          {showCost && group && (
            <section className="space-y-3 rounded-2xl bg-white p-4 shadow-[0_8px_24px_rgba(80,50,35,0.06)]">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-neutral-500">Split a cost</span>
                <button
                  type="button"
                  onClick={() => setShowCost(false)}
                  aria-label="Remove cost"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <label className="flex items-baseline gap-2">
                <span className="text-[30px] font-bold text-neutral-900">$</span>
                <input
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Amount per person"
                  className="w-24 bg-transparent text-[30px] font-bold text-neutral-900 outline-none placeholder:text-neutral-300"
                />
                <span className="text-sm text-neutral-500">per person</span>
              </label>
              <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 pt-3">
                <input
                  value={venmo}
                  onChange={(e) => setVenmo(e.target.value)}
                  placeholder="Venmo @handle"
                  aria-label="Venmo"
                  className="h-10 rounded-xl bg-neutral-100 px-3 text-[14px] outline-none placeholder:text-neutral-400"
                />
                <input
                  value={zelle}
                  onChange={(e) => setZelle(e.target.value)}
                  placeholder="Zelle email/phone"
                  aria-label="Zelle"
                  className="h-10 rounded-xl bg-neutral-100 px-3 text-[14px] outline-none placeholder:text-neutral-400"
                />
              </div>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            {!showNote && (
              <button
                type="button"
                onClick={() => setShowNote(true)}
                className="inline-flex h-[38px] items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-neutral-300 px-3.5 text-[13px] font-semibold text-neutral-800"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.6} /> Note
              </button>
            )}
            {group && !showCost && (
              <button
                type="button"
                onClick={() => setShowCost(true)}
                className="inline-flex h-[38px] items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-neutral-300 px-3.5 text-[13px] font-semibold text-neutral-800"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.6} /> Split a cost
              </button>
            )}
            {group &&
              !voting &&
              EXTRAS.map(({ key, label, icon: Icon }) => {
                const on = extras.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setExtras((x) => (on ? x.filter((k) => k !== key) : [...x, key]))}
                    aria-pressed={on}
                    className={`inline-flex h-[38px] items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-semibold transition ${
                      on
                        ? "bg-neutral-900 text-white"
                        : "border-[1.5px] border-dashed border-neutral-300 text-neutral-800"
                    }`}
                  >
                    {on ? <Check className="h-3.5 w-3.5" strokeWidth={2.8} /> : <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />}
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      {/* Sticky send bar */}
      <footer className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-linen via-linen to-linen/0 pt-6">
        <div className="mx-auto max-w-xl space-y-2.5 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6">
          {error ? (
            <p className="text-center text-[13px] font-medium text-rose-700">{error}</p>
          ) : (
            <p className="truncate text-center text-[13px] font-medium text-neutral-500">{summary}</p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={sending}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-fuchsia-700 text-[16px] font-semibold text-white shadow-[0_12px_26px_rgba(181,82,74,0.25)] transition hover:bg-fuchsia-800 disabled:opacity-70"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {cta}
            {!sending && <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.4} />}
          </button>
        </div>
      </footer>
    </div>
  );
}
