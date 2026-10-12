"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Check,
  Loader2,
  Crown,
  MapPin,
  CalendarClock,
  Link2,
  ArrowUpRight,
  AlignLeft,
  ChevronRight,
  DollarSign,
  Plus,
  Minus,
  Ticket,
} from "lucide-react";
import { updateHostEvent, setEventCapacity } from "@/app/event-actions";
import { FeeRow } from "./EventFeePanel";
import { WhenPicker, type WhenValue } from "./WhenPicker";
import { clientTimeZone, isoFromLocal, localFromIso, formatWhenRange } from "@/lib/localDateTime";

export interface EventHeaderData {
  eventId: string;
  isHost: boolean;
  title: string;
  /** Display "when" text. */
  when: string;
  location: string;
  hostName: string;
  /** Display note (note || summary). */
  displayNote: string;
  sourceUrl: string | null;
  startsAt: string | null;
  /** End time from the viewer's card, when the plan has one. */
  endsAt: string | null;
  hasTime: boolean;
  note: string;
  feeCents: number;
  paymentLink: string;
  venmoId: string;
  zelleId: string;
  /** The viewer's own invite card id + whether they've marked the fee paid. */
  cardId?: string;
  feePaid: boolean;
  /** Guest limit (null = none), whether a waitlist opens when full, and counts. */
  capacity: number | null;
  waitlistOn: boolean;
  goingCount: number;
  waitlistCount: number;
}

type Field = "title" | "when" | "location" | "note" | "fee" | "cap";

interface Values {
  title: string;
  when: string;
  startsAt: string | null;
  endsAt: string | null;
  hasTime: boolean;
  location: string;
  note: string;
  feeCents: number;
  venmoId: string;
  zelleId: string;
  paymentLink: string;
}

const valuesOf = (d: EventHeaderData): Values => ({
  title: d.title,
  when: d.when,
  startsAt: d.startsAt,
  endsAt: d.endsAt,
  hasTime: d.hasTime,
  location: d.location,
  note: d.note,
  feeCents: d.feeCents,
  venmoId: d.venmoId,
  zelleId: d.zelleId,
  paymentLink: d.paymentLink,
});

const rowCls = "flex w-full items-center gap-3.5 px-4 py-3.5 text-left";
const smallBtn = "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-semibold transition disabled:opacity-60";

/**
 * The plan page's header — title, when, where, fee, note. For the host every
 * piece edits right where it sits (tap it); nothing opens a separate form.
 */
export function EventHeader({ data }: { data: EventHeaderData }) {
  const router = useRouter();
  const tz = clientTimeZone();
  const [v, setV] = useState<Values>(() => valuesOf(data));
  const [editing, setEditing] = useState<Field | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feeRef = useRef<HTMLDivElement>(null);
  const host = data.isHost;

  // Pick up fresh server data after a refresh.
  const dataKey = JSON.stringify(valuesOf(data));
  useEffect(() => {
    setV(valuesOf(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);


  async function save(patch: Partial<Values>) {
    const next = { ...v, ...patch };
    setBusy(true);
    setError(null);
    const res = await updateHostEvent({
      eventId: data.eventId,
      title: next.title,
      whenText: next.when,
      startsAt: next.startsAt ?? undefined,
      hasTime: next.hasTime,
      endsAt: next.endsAt,
      location: next.location,
      note: next.note,
      feeCents: next.feeCents > 0 ? next.feeCents : null,
      paymentLink: next.paymentLink,
      venmoId: next.venmoId,
      zelleId: next.zelleId,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't save.");
      return false;
    }
    setV({ ...next, when: res.when ?? next.when });
    setEditing(null);
    router.refresh();
    return true;
  }

  const tile = headerTile(v.startsAt, v.hasTime, tz);
  const rel = relativeDay(v.startsAt, tz);
  const mapsHref = v.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.location)}`
    : null;
  const noteText = host ? v.note : data.displayNote;
  const showCard = host || v.when || v.location || v.feeCents > 0 || noteText;

  const dateBox = tile ? (
    <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-neutral-100 py-1.5">
      <span className="text-[10px] font-semibold tracking-wider text-neutral-600">{tile.top}</span>
      <span className="text-xl font-bold leading-tight text-neutral-900">{tile.day}</span>
    </div>
  ) : (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
      <CalendarClock className="h-5 w-5 text-neutral-600" />
    </span>
  );
  const iconBox = (icon: React.ReactNode, bg: string) => (
    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${bg}`}>{icon}</span>
  );
  const chevron = <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" strokeWidth={2.4} />;
  const ghost = (text: string) => <span className="text-[15px] font-medium text-neutral-400">{text}</span>;

  return (
    <header className="mb-6 space-y-5">
      <div className="space-y-2.5">
        {host && editing === "title" ? (
          <InlineText
            value={v.title}
            busy={busy}
            className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900"
            onCancel={() => setEditing(null)}
            onCommit={(t) => (t && t !== v.title ? save({ title: t }) : setEditing(null))}
          />
        ) : host ? (
          <button type="button" onClick={() => setEditing("title")} className="group flex items-start gap-2.5 text-left">
            <h1 className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900">{v.title}</h1>
            <Pencil className="mt-3 h-4 w-4 shrink-0 text-neutral-300 transition group-hover:text-neutral-500" />
          </button>
        ) : (
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900">{v.title}</h1>
        )}
        <p className="flex items-center gap-2 text-sm text-neutral-600">
          <Crown className="h-4 w-4 text-fuchsia-600" />
          {host ? (
            "You're hosting"
          ) : (
            <span>
              Hosted by <span className="font-semibold text-neutral-900">{data.hostName}</span>
            </span>
          )}
        </p>
      </div>

      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

      {showCard && (
        <div className="divide-y divide-neutral-100 rounded-[20px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)] [&>*:first-child]:rounded-t-[20px] [&>*:last-child]:rounded-b-[20px]">
          {/* When */}
          {host && editing === "when" ? (
            <WhenEditor
              v={v}
              tz={tz}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={(p) => save(p)}
            />
          ) : host ? (
            <button type="button" onClick={() => setEditing("when")} className={`${rowCls} transition hover:bg-neutral-50`}>
              {dateBox}
              <div className="min-w-0 flex-1">
                {v.when ? (
                  <>
                    <p className="text-[15px] font-semibold text-neutral-900">{v.when}</p>
                    {rel && <p className="text-[13px] text-neutral-600">{rel}</p>}
                  </>
                ) : (
                  ghost("Add a time")
                )}
              </div>
              {chevron}
            </button>
          ) : (
            v.when && (
              <div className={rowCls}>
                {dateBox}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-neutral-900">{v.when}</p>
                  {rel && <p className="text-[13px] text-neutral-600">{rel}</p>}
                </div>
              </div>
            )
          )}

          {/* Where */}
          {host && editing === "location" ? (
            <div className={rowCls}>
              {iconBox(<MapPin className="h-5 w-5 text-emerald-700" />, "bg-emerald-50")}
              <InlineText
                value={v.location}
                placeholder="Where is it?"
                busy={busy}
                className="text-[15px] font-semibold text-neutral-900"
                onCancel={() => setEditing(null)}
                onCommit={(t) => (t !== v.location ? save({ location: t }) : setEditing(null))}
              />
            </div>
          ) : (host || v.location) && (
            <div className="flex items-center gap-3.5 px-4 py-3.5">
              {iconBox(<MapPin className="h-5 w-5 text-emerald-700" />, "bg-emerald-50")}
              {host ? (
                <button type="button" onClick={() => setEditing("location")} className="min-w-0 flex-1 text-left">
                  {v.location ? <span className="text-[15px] font-semibold text-neutral-900">{v.location}</span> : ghost("Add a place")}
                </button>
              ) : (
                <p className="min-w-0 flex-1 text-[15px] font-semibold text-neutral-900">{v.location}</p>
              )}
              {mapsHref && (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open in Maps"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-700 transition hover:bg-neutral-50"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              )}
            </div>
          )}

          {/* Fee */}
          {host && editing === "fee" ? (
            <div ref={feeRef}>
              <FeeEditor v={v} busy={busy} onCancel={() => setEditing(null)} onSave={(p) => save(p)} />
            </div>
          ) : host && v.feeCents <= 0 ? (
            <button type="button" onClick={() => setEditing("fee")} className={`${rowCls} transition hover:bg-neutral-50`}>
              {iconBox(<span className="text-[20px] font-bold text-amber-800">$</span>, "bg-amber-100")}
              <div className="min-w-0 flex-1">
                {ghost("Add a fee")}
                <p className="truncate text-[13px] text-neutral-400">optional — guests pay you on Venmo / Zelle</p>
              </div>
              <Plus className="h-4 w-4 shrink-0 text-neutral-300" strokeWidth={2.4} />
            </button>
          ) : host ? (
            <button type="button" onClick={() => setEditing("fee")} className={`${rowCls} transition hover:bg-neutral-50`}>
              {iconBox(<span className="text-[20px] font-bold text-amber-800">$</span>, "bg-amber-100")}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-neutral-900">{money(v.feeCents)} per person</p>
                <p className="truncate text-[13px] text-neutral-600">
                  {v.venmoId ? `Guests pay you on Venmo @${v.venmoId}` : v.zelleId ? "Guests pay you on Zelle" : "Guests pay you directly"}
                </p>
              </div>
              {chevron}
            </button>
          ) : (
            !host &&
            v.feeCents > 0 && (
              <FeeRow
                cardId={data.cardId}
                feeCents={v.feeCents}
                venmoId={v.venmoId || null}
                zelleId={v.zelleId || null}
                paymentLink={v.paymentLink || null}
                feePaid={data.feePaid}
                isHost={false}
                hostName={data.hostName}
                note={v.title}
              />
            )
          )}

          {/* Guest limit */}
          {host && editing === "cap" ? (
            <CapEditor
              eventId={data.eventId}
              capacity={data.capacity}
              waitlistOn={data.waitlistOn}
              going={data.goingCount}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          ) : host && data.capacity === null ? (
            <button type="button" onClick={() => setEditing("cap")} className={`${rowCls} transition hover:bg-neutral-50`}>
              {iconBox(<Ticket className="h-5 w-5 text-violet-700" />, "bg-violet-50")}
              <div className="min-w-0 flex-1">
                {ghost("Add a guest limit")}
                <p className="truncate text-[13px] text-neutral-400">optional — no limit right now</p>
              </div>
              <Plus className="h-4 w-4 shrink-0 text-neutral-300" strokeWidth={2.4} />
            </button>
          ) : (
            data.capacity !== null &&
            (host ? (
              <button type="button" onClick={() => setEditing("cap")} className={`${rowCls} transition hover:bg-neutral-50`}>
                {iconBox(<Ticket className="h-5 w-5 text-violet-700" />, "bg-violet-50")}
                <CapSummary host data={data} />
                {chevron}
              </button>
            ) : (
              <div className={rowCls}>
                {iconBox(<Ticket className="h-5 w-5 text-violet-700" />, "bg-violet-50")}
                <CapSummary host={false} data={data} />
              </div>
            ))
          )}

          {/* Note */}
          {host && editing === "note" ? (
            <div className="flex items-start gap-3.5 px-4 py-3.5">
              {iconBox(<AlignLeft className="h-5 w-5 text-neutral-600" />, "bg-neutral-100")}
              <InlineText
                value={v.note}
                multiline
                placeholder="Anything guests should know?"
                busy={busy}
                className="text-[15px] leading-relaxed text-neutral-800"
                onCancel={() => setEditing(null)}
                onCommit={(t) => (t !== v.note ? save({ note: t }) : setEditing(null))}
              />
            </div>
          ) : host ? (
            <button type="button" onClick={() => setEditing("note")} className={`${rowCls} items-start transition hover:bg-neutral-50`}>
              {iconBox(<AlignLeft className="h-5 w-5 text-neutral-600" />, "bg-neutral-100")}
              <div className="min-w-0 flex-1 self-center">
                {v.note ? (
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-800">{v.note}</p>
                ) : (
                  ghost("Add a note for guests")
                )}
              </div>
              <Pencil className="h-4 w-4 shrink-0 self-center text-neutral-300" />
            </button>
          ) : (
            noteText && (
              <div className="flex items-start gap-3.5 px-4 py-3.5">
                {iconBox(<AlignLeft className="h-5 w-5 text-neutral-600" />, "bg-neutral-100")}
                <div className="min-w-0 flex-1 self-center">
                  <p className="text-[12px] font-semibold text-neutral-500">From {data.hostName}</p>
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-800">{noteText}</p>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {data.sourceUrl && (
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700 hover:underline"
        >
          <Link2 className="h-3.5 w-3.5" /> Original details
        </a>
      )}
    </header>
  );
}

/* ------------------------------ inline editors ----------------------------- */

/** A text field that saves on Enter / tap-away / ✓ and backs out on Escape. */
function InlineText({
  value,
  onCommit,
  onCancel,
  placeholder,
  multiline,
  busy,
  className,
}: {
  value: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
  placeholder?: string;
  multiline?: boolean;
  busy: boolean;
  className: string;
}) {
  const [text, setText] = useState(value);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(text.trim());
  };
  const cancel = () => {
    done.current = true;
    onCancel();
  };
  const common = {
    value: text,
    autoFocus: true,
    placeholder,
    onBlur: commit,
    className: `min-w-0 flex-1 bg-transparent outline-none placeholder:font-normal placeholder:text-neutral-400 ${className}`,
  };
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2 border-b-2 border-neutral-900 pb-1">
      {multiline ? (
        <textarea
          {...common}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && cancel()}
          className={`${common.className} resize-none`}
        />
      ) : (
        <input
          {...common}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
        />
      )}
      <button
        type="button"
        aria-label="Save"
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        disabled={busy}
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.6} />}
      </button>
    </div>
  );
}

function EditorButtons({ busy, onCancel, onSave, left }: { busy: boolean; onCancel: () => void; onSave: () => void; left?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>{left}</div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={`${smallBtn} bg-neutral-100 text-neutral-800 hover:bg-neutral-200`}>
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={busy} className={`${smallBtn} bg-neutral-900 text-white hover:bg-neutral-700`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" strokeWidth={2.6} />}
          Save
        </button>
      </div>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const addHour = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${pad(Math.min(23, h + 1))}:${pad(m)}`;
};

/** The When row opened up into the same date / time picker as New plan. */
function WhenEditor({
  v,
  tz,
  busy,
  onCancel,
  onSave,
}: {
  v: Values;
  tz: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (p: Partial<Values>) => void;
}) {
  const today = localFromIso(new Date().toISOString(), tz)?.date ?? new Date().toISOString().slice(0, 10);
  const [w, setW] = useState<WhenValue>(() => {
    const s = v.startsAt ? localFromIso(v.startsAt, tz) : null;
    const e = v.endsAt ? localFromIso(v.endsAt, tz) : null;
    const start = v.hasTime && s?.time ? s.time : "18:00";
    return {
      date: s?.date ?? today,
      start,
      end: e?.time && e.date === s?.date ? e.time : addHour(start),
      allDay: !v.hasTime,
    };
  });
  const save = () => {
    const startsAt = isoFromLocal(w.date, w.allDay ? null : w.start, tz);
    if (!startsAt) return;
    const endsAt = w.allDay ? null : isoFromLocal(w.date, w.end, tz);
    onSave({ startsAt, endsAt, hasTime: !w.allDay, when: formatWhenRange(startsAt, endsAt, tz, !w.allDay) });
  };
  return (
    <div className="space-y-3 bg-neutral-50/60 px-4 py-4">
      <WhenPicker value={w} onChange={setW} today={today < w.date ? today : w.date} />
      <EditorButtons busy={busy} onCancel={onCancel} onSave={save} />
    </div>
  );
}

/** The Fee row opened up: amount + how guests pay you. */
function FeeEditor({
  v,
  busy,
  onCancel,
  onSave,
}: {
  v: Values;
  busy: boolean;
  onCancel: () => void;
  onSave: (p: Partial<Values>) => void;
}) {
  const [amount, setAmount] = useState(v.feeCents > 0 ? String(v.feeCents / 100) : "");
  const [venmo, setVenmo] = useState(v.venmoId);
  const [zelle, setZelle] = useState(v.zelleId);
  const save = () => {
    const n = parseFloat(amount);
    const feeCents = Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
    onSave({ feeCents, venmoId: venmo.trim().replace(/^@/, ""), zelleId: zelle.trim() });
  };
  const input = "h-10 min-w-0 rounded-xl bg-neutral-100 px-3 text-[14px] outline-none placeholder:text-neutral-400";
  return (
    <div className="space-y-3 bg-neutral-50/60 px-4 py-4">
      <div className="flex items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100">
          <DollarSign className="h-5 w-5 text-amber-800" />
        </span>
        <label className="flex flex-1 items-baseline gap-2 border-b-2 border-neutral-900 pb-1">
          <span className="text-[24px] font-bold text-neutral-900">$</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            autoFocus
            aria-label="Amount per person"
            className="w-20 bg-transparent text-[24px] font-bold text-neutral-900 outline-none placeholder:text-neutral-300"
          />
          <span className="text-sm text-neutral-500">per person</span>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 pl-[62px]">
        <input value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="Venmo @handle" aria-label="Venmo" className={input} />
        <input value={zelle} onChange={(e) => setZelle(e.target.value)} placeholder="Zelle email/phone" aria-label="Zelle" className={input} />
      </div>
      <div className="pl-[62px]">
        <EditorButtons
          busy={busy}
          onCancel={onCancel}
          onSave={save}
          left={
            v.feeCents > 0 ? (
              <button
                type="button"
                onClick={() => onSave({ feeCents: 0 })}
                disabled={busy}
                className="text-[13px] font-semibold text-fuchsia-700 hover:underline"
              >
                Remove fee
              </button>
            ) : null
          }
        />
      </div>
    </div>
  );
}

/** "3 spots left · 17 of 20 going" / "Full · 20 of 20" with a fill bar. */
function CapSummary({ host, data }: { host: boolean; data: EventHeaderData }) {
  const cap = data.capacity ?? 0;
  const going = data.goingCount;
  const left = Math.max(0, cap - going);
  const full = left === 0;
  const main = full ? `Full · ${going} of ${cap}` : `${left} ${left === 1 ? "spot" : "spots"} left`;
  const sub = !full
    ? `${going} of ${cap} going`
    : host
      ? data.waitlistOn
        ? `${data.waitlistCount} on the waitlist`
        : "Waitlist off"
      : data.waitlistOn
        ? "Join the waitlist — you'll move in if a spot opens"
        : "No more spots";
  const pct = cap > 0 ? Math.min(100, Math.round((going / cap) * 100)) : 0;
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[15px] font-semibold text-neutral-900">{main}</p>
      <p className="truncate text-[13px] text-neutral-600">{sub}</p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${full ? "bg-neutral-900" : "bg-fuchsia-700"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The guest-limit row opened up: − N + stepper, waitlist switch, remove. */
function CapEditor({
  eventId,
  capacity,
  waitlistOn,
  going,
  onCancel,
  onSaved,
}: {
  eventId: string;
  capacity: number | null;
  waitlistOn: boolean;
  going: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const min = Math.max(1, going);
  const [n, setN] = useState(String(capacity ?? Math.max(20, going)));
  const [wait, setWait] = useState(waitlistOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = parseInt(n, 10);
  const step = (d: number) => setN(String(Math.max(min, (Number.isFinite(num) ? num : min) + d)));

  async function save(cap: number | null) {
    if (cap !== null && (!Number.isFinite(cap) || cap < min)) {
      setError(going > 0 ? `${going} ${going === 1 ? "person is" : "people are"} already going — pick ${min} or more.` : "Pick at least 1.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await setEventCapacity(eventId, cap, wait);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't save.");
    onSaved();
  }

  const stepBtn = "flex h-9 w-9 items-center justify-center rounded-[10px] bg-neutral-100 text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-40";
  return (
    <div className="space-y-3.5 bg-neutral-50/60 px-4 py-4">
      <div className="flex items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50">
          <Ticket className="h-5 w-5 text-violet-700" />
        </span>
        <span className="flex-1 text-[15px] font-semibold text-neutral-900">Guest limit</span>
        <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <button type="button" aria-label="Fewer" onClick={() => step(-1)} disabled={busy || num <= min} className={stepBtn}>
            <Minus className="h-4 w-4" strokeWidth={2.4} />
          </button>
          <input
            value={n}
            onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            aria-label="Guest limit"
            className="w-12 bg-transparent text-center text-[20px] font-bold text-neutral-900 outline-none"
          />
          <button type="button" aria-label="More" onClick={() => step(1)} disabled={busy} className={stepBtn}>
            <Plus className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={wait}
        onClick={() => setWait((w) => !w)}
        className="flex w-full items-center gap-3 pl-[62px] text-left"
      >
        <span className="flex-1">
          <span className="block text-[14px] font-semibold text-neutral-900">Waitlist when full</span>
          <span className="block text-[12px] text-neutral-500">Next in line moves in if someone drops</span>
        </span>
        <span className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${wait ? "bg-neutral-900" : "bg-neutral-300"}`}>
          <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${wait ? "left-[21px]" : "left-[3px]"}`} />
        </span>
      </button>
      {error && <p className="pl-[62px] text-[13px] font-medium text-rose-600">{error}</p>}
      <div className="pl-[62px]">
        <EditorButtons
          busy={busy}
          onCancel={onCancel}
          onSave={() => save(num)}
          left={
            capacity !== null ? (
              <button
                type="button"
                onClick={() => save(null)}
                disabled={busy}
                className="text-[13px] font-semibold text-fuchsia-700 hover:underline"
              >
                Remove limit
              </button>
            ) : null
          }
        />
      </div>
    </div>
  );
}

/** Integer cents → "$40" / "$16.67". */
function money(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** Weekday (this week) or month, plus day number, for the header date tile. */
function headerTile(iso: string | null, _hasTime: boolean, tz: string): { top: string; day: string } | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  const loc = localFromIso(iso, tz);
  if (!loc?.date) return null;
  const [y, m, d] = loc.date.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  const days = (noon.getTime() - Date.now()) / 86_400_000;
  const top =
    days > -1 && days < 6.5
      ? noon.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
      : noon.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return { top: top.toUpperCase(), day: String(d) };
}

/** "Today" / "Tomorrow" / "In 3 days" / "2 days ago" for the event day. */
function relativeDay(iso: string | null, tz: string): string {
  if (!iso) return "";
  const day = localFromIso(iso, tz)?.date;
  const today = localFromIso(new Date().toISOString(), tz)?.date;
  if (!day || !today) return "";
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const diff = Math.round((toUtc(day) - toUtc(today)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff > 1 ? `In ${diff} days` : `${-diff} days ago`;
}
