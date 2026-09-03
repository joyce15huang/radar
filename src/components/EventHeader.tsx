"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, Plus, Loader2, Users, Crown, MapPin, CalendarClock, Link2 } from "lucide-react";
import { updateHostEvent, toggleReinvite } from "@/app/event-actions";
import { setEventModules } from "@/app/module-actions";
import { EventFeePanel } from "./EventFeePanel";
import { DateTimeField, type DTValue } from "./DateTimeField";
import { clientTimeZone, isoFromLocal, localFromIso, formatWhen } from "@/lib/localDateTime";

export interface EventHeaderData {
  eventId: string;
  isHost: boolean;
  title: string;
  /** Display-only "when" text. */
  when: string;
  location: string;
  hostName: string;
  /** Display note (note || summary). */
  displayNote: string;
  sourceUrl: string | null;
  /** Edit-form fields. */
  startsAt: string | null;
  hasTime: boolean;
  note: string;
  feeCents: number;
  paymentLink: string;
  venmoId: string;
  zelleId: string;
  allowReinvite: boolean;
  /** The viewer's own invite card id + whether they've marked the fee paid. */
  cardId?: string;
  feePaid: boolean;
  /** Enabled optional sections (carpool / expenses / tasks). */
  modules: string[];
}

const SECTION_OPTIONS: { key: string; label: string }[] = [
  { key: "carpool", label: "Carpool" },
  { key: "expenses", label: "Expenses" },
  { key: "tasks", label: "Tasks" },
];

const field =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";
const pill =
  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60";
const neutralPill = `${pill} border border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800`;
const darkPill = `${pill} bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200`;

/** The event page's Overview header — title, when/where/host, notes — with the
 *  host's Edit control on the title row and the edit form rendered in place. */
export function EventHeader({ data }: { data: EventHeaderData }) {
  const router = useRouter();
  const tz = clientTimeZone();

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(data.title);
  const [dt, setDt] = useState<DTValue>(() => {
    const local = data.startsAt ? localFromIso(data.startsAt, tz) : null;
    return local ? { date: local.date, time: data.hasTime ? local.time : null } : { date: "", time: null };
  });
  const [location, setLocation] = useState(data.location);
  const [note, setNote] = useState(data.note);
  const [feeStr, setFeeStr] = useState(data.feeCents ? String(data.feeCents / 100) : "");
  const [venmo, setVenmo] = useState(data.venmoId);
  const [zelle, setZelle] = useState(data.zelleId);
  const [allowReinvite, setAllowReinvite] = useState(data.allowReinvite);
  const [modules, setModules] = useState<Set<string>>(() => new Set(data.modules));

  function toggleModule(key: string) {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function saveEdit() {
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    const startsAt = isoFromLocal(dt.date, dt.time, tz);
    if (!startsAt) {
      setError("Pick a date.");
      return;
    }
    const hasTime = dt.time !== null;
    const parsedFee = parseFloat(feeStr);
    const feeCents =
      feeStr.trim() && Number.isFinite(parsedFee) && parsedFee > 0 ? Math.round(parsedFee * 100) : null;

    setBusy(true);
    setError(null);
    const res = await updateHostEvent({
      eventId: data.eventId,
      title: title.trim(),
      whenText: formatWhen(startsAt, tz, hasTime),
      startsAt,
      hasTime,
      location: location.trim(),
      note: note.trim(),
      feeCents,
      paymentLink: data.paymentLink,
      venmoId: venmo.trim(),
      zelleId: zelle.trim(),
    });
    if (res.ok && allowReinvite !== data.allowReinvite) {
      await toggleReinvite({ eventId: data.eventId, allow: allowReinvite });
    }
    if (res.ok) {
      const nextModules = [...modules];
      const changed =
        nextModules.length !== data.modules.length ||
        nextModules.some((m) => !data.modules.includes(m));
      if (changed) await setEventModules(data.eventId, nextModules);
    }
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't save.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="mb-5 space-y-2.5 rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </label>
        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">When</span>
          <DateTimeField value={dt} onChange={setDt} />
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Location</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="optional" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Details</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional"
            rows={4}
            className={`${field} max-h-40 resize-y overflow-y-auto whitespace-pre-wrap break-words`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Fee to join ($)</span>
          <input value={feeStr} onChange={(e) => setFeeStr(e.target.value)} inputMode="decimal" placeholder="blank = free" className={field} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Venmo</span>
            <input value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@handle" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Zelle</span>
            <input value={zelle} onChange={(e) => setZelle(e.target.value)} placeholder="email or phone" className={field} />
          </label>
        </div>
        <label className="flex items-center gap-2 pt-0.5 text-sm text-neutral-600 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={allowReinvite}
            onChange={(e) => setAllowReinvite(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400 dark:border-neutral-600"
          />
          <Users className="h-3.5 w-3.5 text-neutral-400" />
          Let guests invite others
        </label>

        <div className="pt-1">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Sections <span className="font-normal text-neutral-400 dark:text-neutral-500">(tap to show on the event)</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SECTION_OPTIONS.map((s) => {
              const on = modules.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleModule(s.key)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"
                      : "border border-neutral-200 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  }`}
                >
                  {on ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Plus className="h-3.5 w-3.5" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={() => setEditing(false)} disabled={busy} className={neutralPill}>
            Cancel
          </button>
          <button type="button" onClick={saveEdit} disabled={busy} className={darkPill}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Save
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <header className="mb-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {data.title}
        </h1>
        {data.isHost && (
          <button type="button" onClick={() => setEditing(true)} className={`${neutralPill} shrink-0`}>
            <Pencil className="h-4 w-4" /> Edit
          </button>
        )}
      </div>
      <div className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
        {data.when && (
          <p className="flex items-center gap-1.5 font-medium text-neutral-700 dark:text-neutral-200">
            <CalendarClock className="h-4 w-4 text-neutral-400" />
            {data.when}
          </p>
        )}
        {data.location && (
          <p className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-neutral-400" />
            {data.location}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
          <Crown className="h-4 w-4 text-fuchsia-400" />
          {data.isHost ? "You're hosting" : `Hosted by ${data.hostName}`}
        </p>
      </div>
      {data.feeCents > 0 && (
        <EventFeePanel
          cardId={data.cardId}
          feeCents={data.feeCents}
          venmoId={data.venmoId || null}
          zelleId={data.zelleId || null}
          paymentLink={data.paymentLink || null}
          feePaid={data.feePaid}
          isHost={data.isHost}
          note={data.title}
        />
      )}
      {data.displayNote && (
        <p className="mt-3 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-neutral-600 dark:text-neutral-300">
          {data.displayNote}
        </p>
      )}
      {data.sourceUrl && (
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:underline dark:text-amber-400"
        >
          <Link2 className="h-3.5 w-3.5" /> Original details
        </a>
      )}
    </header>
  );
}
