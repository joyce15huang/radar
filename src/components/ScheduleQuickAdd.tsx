"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Check, Sparkles, ArrowLeft } from "lucide-react";
import { parseSchedule, confirmSchedule } from "@/app/schedule-actions";
import { DateTimeField, type DTValue } from "./DateTimeField";
import { clientTimeZone, isoFromLocal, localFromIso } from "@/lib/localDateTime";
import { isRedundantNote } from "@/lib/noteText";

interface ReviewItem {
  title: string;
  dt: DTValue;
  location?: string;
  note?: string;
}

function todayValue(tz: string): DTValue {
  const now = new Date().toISOString();
  const local = localFromIso(now, tz);
  return { date: local?.date ?? now.slice(0, 10), time: null };
}

export function ScheduleQuickAdd() {
  const router = useRouter();
  const tz = clientTimeZone();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"input" | "review">("input");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function review() {
    if (!text.trim()) {
      setErr("Type at least one event.");
      return;
    }
    setPending(true);
    setErr(null);
    setMsg(null);
    const res = await parseSchedule(text);
    setPending(false);
    if (!res.ok || !res.events) {
      setErr(res.error ?? "Couldn't read that.");
      return;
    }
    setItems(
      res.events.map((e) => {
        const local = e.startsAt ? localFromIso(e.startsAt, tz) : null;
        return {
          title: e.title,
          dt: local
            ? { date: local.date, time: e.hasTime ? local.time : null }
            : todayValue(tz),
          location: e.location,
          note: e.note,
        };
      }),
    );
    setPhase("review");
  }

  async function confirm() {
    setPending(true);
    setErr(null);
    const payload = items
      .map((it) => {
        const startsAt = isoFromLocal(it.dt.date, it.dt.time, tz);
        return startsAt
          ? {
              title: it.title,
              startsAt,
              hasTime: it.dt.time !== null,
              location: it.location,
              note: it.note,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const res = await confirmSchedule(payload);
    setPending(false);
    if (!res.ok) {
      setErr(res.error ?? "Couldn't add those.");
      return;
    }
    setText("");
    setItems([]);
    setPhase("input");
    setMsg(`Added ${res.added} ${res.added === 1 ? "event" : "events"} to your calendar.`);
    router.refresh();
  }

  const patch = (i: number, dt: DTValue) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, dt } : it)));
  const patchTitle = (i: number, title: string) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, title } : it)));

  return (
    <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {phase === "input" ? (
        <>
          <textarea
            rows={2}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setMsg(null);
              setErr(null);
            }}
            placeholder="fri lunch at google, 6p bball game, sat sf with Cedric"
            className="w-full resize-y rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              Type in plain English — you&rsquo;ll pick the exact date next.
            </span>
            <button
              type="button"
              onClick={review}
              disabled={pending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Review dates
                </>
              )}
            </button>
          </div>
          {msg && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" strokeWidth={2.5} />
              {msg}
            </p>
          )}
          {err && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{err}</p>}
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Confirm the date for each — tap the calendar to change it.
          </p>
          {items.map((it, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
              <input
                value={it.title}
                onChange={(e) => patchTitle(i, e.target.value)}
                className="mb-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:ring-neutral-700"
              />
              <DateTimeField value={it.dt} onChange={(dt) => patch(i, dt)} />
              {(() => {
                const noteOk = it.note && !isRedundantNote(it.note, { location: it.location });
                const extra = [it.location, noteOk ? it.note : undefined]
                  .filter(Boolean)
                  .join(" · ");
                return extra ? (
                  <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">{extra}</p>
                ) : null;
              })()}
            </div>
          ))}
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPhase("input");
                setErr(null);
              }}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Adding…
                </>
              ) : (
                <>
                  <CalendarPlus className="h-4 w-4" /> Add {items.length}{" "}
                  {items.length === 1 ? "event" : "events"}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
