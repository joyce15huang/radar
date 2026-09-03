"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Send, Users, CalendarClock, Clock, AtSign, CalendarDays, Megaphone } from "lucide-react";
import {
  createPoll,
  createDirectEvent,
  createFollowerBroadcast,
  lookupRecipient,
  searchProfiles,
  type RecipientMatch,
} from "@/app/poll-actions";
import { listMyGroups, type GroupWithMembers } from "@/app/group-actions";
import { DateTimeField, type DTValue } from "./DateTimeField";
import { clientTimeZone, isoFromLocal, formatWhen } from "@/lib/localDateTime";

const field =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

interface Recipient {
  id: string;
  label: string;
}

interface OptionDraft {
  label: string;
  startsAt: string | null;
  dt: DTValue;
  open: boolean;
}

const newOption = (): OptionDraft => ({ label: "", startsAt: null, dt: { date: "", time: "18:00" }, open: false });

/** Compose a Group event: what / where / cost + pay handles, a fixed time OR a
 *  "find a time" poll of free-text options, and recipients added by handle. */
export function PollCompose({
  audience = "list",
  followerCount = 0,
}: {
  audience?: "list" | "followers";
  followerCount?: number;
} = {}) {
  const router = useRouter();
  const tz = clientTimeZone();
  const broadcast = audience === "followers";

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [cost, setCost] = useState("");
  const [venmo, setVenmo] = useState("");
  const [zelle, setZelle] = useState("");

  const [mode, setMode] = useState<"fixed" | "poll">("fixed");
  const [dt, setDt] = useState<DTValue>({ date: "", time: "18:00" });
  const [options, setOptions] = useState<OptionDraft[]>([newOption(), newOption()]);

  function setOpt(i: number, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  }

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [handle, setHandle] = useState("");
  const [looking, setLooking] = useState(false);
  const [suggestions, setSuggestions] = useState<RecipientMatch[]>([]);
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);

  useEffect(() => {
    let live = true;
    listMyGroups()
      .then((g) => {
        if (live) setGroups(g.filter((x) => x.members.length > 0));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function addGroup(g: GroupWithMembers) {
    setRecipients((prev) => {
      const have = new Set(prev.map((r) => r.id));
      const add = g.members
        .filter((m) => !have.has(m.id))
        .map((m) => ({ id: m.id, label: m.username ? `@${m.username}` : m.email }));
      return [...prev, ...add];
    });
  }

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefix typeahead (debounced), excluding people already added.
  useEffect(() => {
    const q = handle.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      const res = await searchProfiles(q);
      if (live) setSuggestions(res.filter((m) => !recipients.some((r) => r.id === m.id)));
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [handle, recipients]);

  function addMatch(match: RecipientMatch) {
    if (!recipients.some((r) => r.id === match.id)) {
      setRecipients((prev) => [...prev, { id: match.id, label: match.username ? `@${match.username}` : match.email }]);
    }
    setHandle("");
    setSuggestions([]);
  }

  async function addRecipient() {
    if (suggestions.length > 0) {
      addMatch(suggestions[0]);
      return;
    }
    const q = handle.trim();
    if (!q || looking) return;
    setLooking(true);
    setError(null);
    const match = await lookupRecipient(q);
    setLooking(false);
    if (!match) {
      setError(`No one found for "${q}".`);
      return;
    }
    addMatch(match);
  }

  async function submit() {
    if (sending) return;
    if (!title.trim()) return setError("Give it a title.");
    const feeCents = cost.trim() && Number.isFinite(parseFloat(cost)) ? Math.round(parseFloat(cost) * 100) : null;

    // Public broadcast: fixed time only, audience = all your followers.
    if (broadcast) {
      const startsAt = dt.date ? isoFromLocal(dt.date, dt.time, tz) : null;
      if (!startsAt) return setError("Pick a date.");
      setSending(true);
      setError(null);
      const res = await createFollowerBroadcast({
        title: title.trim(),
        location: location.trim() || undefined,
        note: note.trim() || undefined,
        feeCents,
        venmoId: venmo.trim() || undefined,
        zelleId: zelle.trim() || undefined,
        eventTime: formatWhen(startsAt, tz, dt.time !== null),
        startsAt,
        hasTime: dt.time !== null,
      });
      setSending(false);
      if (!res.ok || !res.eventId) return setError(res.error ?? "Couldn't broadcast that.");
      router.push(`/event/${res.eventId}`);
      return;
    }

    if (recipients.length === 0) return setError("Add at least one person.");
    const recipientIds = recipients.map((r) => r.id);

    setSending(true);
    setError(null);

    if (mode === "poll") {
      const built = options
        .map((o) => ({ label: o.label.trim(), startsAt: o.startsAt }))
        .filter((o) => o.label);
      if (built.length < 2) {
        setSending(false);
        return setError("Add at least two times to choose between.");
      }
      const res = await createPoll({
        title: title.trim(),
        note: note.trim() || undefined,
        location: location.trim() || undefined,
        feeCents,
        venmoId: venmo.trim() || undefined,
        zelleId: zelle.trim() || undefined,
        options: built,
        recipientIds,
      });
      setSending(false);
      if (!res.ok || !res.pollId) return setError(res.error ?? "Couldn't send that.");
      router.push(`/poll/${res.pollId}`);
      return;
    }

    // Fixed time → create the event and send RSVPs now.
    const startsAt = dt.date ? isoFromLocal(dt.date, dt.time, tz) : null;
    if (!startsAt) {
      setSending(false);
      return setError("Pick a date, or switch to Find a time.");
    }
    const hasTime = dt.time !== null;
    const res = await createDirectEvent({
      title: title.trim(),
      location: location.trim() || undefined,
      note: note.trim() || undefined,
      feeCents,
      venmoId: venmo.trim() || undefined,
      zelleId: zelle.trim() || undefined,
      eventTime: formatWhen(startsAt, tz, hasTime),
      startsAt,
      hasTime,
      recipientIds,
    });
    setSending(false);
    if (!res.ok || !res.eventId) return setError(res.error ?? "Couldn't create the event.");
    router.push(`/event/${res.eventId}`);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Event Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner, hike, game night…" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Location</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="optional" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Detail</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="optional" className={`${field} resize-y`} />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Cost $</span>
            <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="0" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Venmo</span>
            <input value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@handle" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Zelle</span>
            <input value={zelle} onChange={(e) => setZelle(e.target.value)} placeholder="email/phone" className={field} />
          </label>
        </div>
      </div>

      {/* Time — a fixed time, or a poll of options */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {mode === "fixed" ? "When" : "Time poll"}
          </span>
          {!broadcast &&
            (mode === "fixed" ? (
              <button
                type="button"
                onClick={() => setMode("poll")}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
              >
                <CalendarClock className="h-3.5 w-3.5" /> or make it a time poll
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode("fixed")}
                className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:underline dark:text-neutral-400"
              >
                <Clock className="h-3.5 w-3.5" /> or set a specific time
              </button>
            ))}
        </div>

        {mode === "fixed" ? (
          <DateTimeField value={dt} onChange={setDt} />
        ) : (
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="rounded-xl border border-neutral-200/70 p-2 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <input
                    value={o.label}
                    onChange={(e) => setOpt(i, { label: e.target.value, startsAt: null })}
                    placeholder={`Option ${i + 1} — type it, or pick from the calendar →`}
                    className={field}
                  />
                  <button
                    type="button"
                    onClick={() => setOpt(i, { open: !o.open })}
                    aria-label="Pick a date/time"
                    className={`shrink-0 rounded-lg border p-2 transition ${
                      o.open || o.startsAt
                        ? "border-teal-300 bg-teal-50 text-teal-600 dark:border-teal-400/30 dark:bg-teal-500/10 dark:text-teal-400"
                        : "border-neutral-200 text-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <CalendarDays className="h-4 w-4" />
                  </button>
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Remove option"
                      className="shrink-0 rounded-full p-1.5 text-neutral-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {o.open && (
                  <div className="mt-2">
                    <DateTimeField
                      value={o.dt}
                      onChange={(dt) => {
                        const startsAt = dt.date ? isoFromLocal(dt.date, dt.time, tz) : null;
                        setOpt(i, {
                          dt,
                          startsAt,
                          label: startsAt ? formatWhen(startsAt, tz, dt.time !== null) : o.label,
                        });
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOptions((prev) => [...prev, newOption()])}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <Plus className="h-3.5 w-3.5" /> Add an option
            </button>
          </div>
        )}
      </div>

      {broadcast && (
        <div className="flex items-center gap-2 rounded-2xl border border-teal-200/70 bg-teal-50 px-4 py-3 text-sm dark:border-teal-400/20 dark:bg-teal-500/10">
          <Megaphone className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
          <span className="text-teal-800 dark:text-teal-200">
            Broadcasting to all your followers{followerCount ? ` (${followerCount})` : ""}.
          </span>
        </div>
      )}

      {/* Recipients */}
      {!broadcast && (
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          <Users className="h-3.5 w-3.5" /> Ask ({recipients.length})
        </p>
        <div className="relative">
          <div className="flex items-center gap-2">
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRecipient();
                } else if (e.key === "Escape") {
                  setSuggestions([]);
                }
              }}
              placeholder="Start typing a @username…"
              className={field}
            />
            <button
              type="button"
              onClick={addRecipient}
              disabled={looking || !handle.trim()}
              className="shrink-0 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </button>
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addMatch(s)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <AtSign className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    <span className="font-medium text-neutral-800 dark:text-neutral-100">{s.username}</span>
                    {s.email && (
                      <span className="ml-auto truncate text-xs text-neutral-400 dark:text-neutral-500">{s.email}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {groups.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-neutral-400 dark:text-neutral-500">Groups:</span>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => addGroup(g)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <Users className="h-3 w-3" /> {g.name} ({g.members.length})
              </button>
            ))}
          </div>
        )}

        {recipients.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recipients.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                {r.label}
                <button
                  type="button"
                  onClick={() => setRecipients((prev) => prev.filter((x) => x.id !== r.id))}
                  aria-label={`Remove ${r.label}`}
                  className="text-neutral-400 hover:text-rose-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      )}

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={sending}
        className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : broadcast ? (
          <Megaphone className="h-4 w-4" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {broadcast ? "Broadcast" : mode === "poll" ? "Send poll" : "Send invites"}
      </button>
    </div>
  );
}
