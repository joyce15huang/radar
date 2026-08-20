"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Check, CalendarPlus } from "lucide-react";
import { confirmSchedule } from "@/app/schedule-actions";
import { DateTimeField, type DTValue } from "./DateTimeField";
import { clientTimeZone, isoFromLocal, localFromIso } from "@/lib/localDateTime";

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

function todayValue(tz: string): DTValue {
  const now = new Date().toISOString();
  return { date: localFromIso(now, tz)?.date ?? now.slice(0, 10), time: null };
}

/**
 * Round "+" on the Calendar: a FORM-based way to add an event to your calendar
 * (title, exact date/time picker, optional location + note) — the alternative to
 * the plain-text `ScheduleQuickAdd`. Writes an accepted `calendar_radar` card via
 * `confirmSchedule` (same path the text flow confirms into).
 */
export function EventFormFab() {
  const router = useRouter();
  const tz = clientTimeZone();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dt, setDt] = useState<DTValue>(() => todayValue(tz));
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setTitle("");
    setDt(todayValue(tz));
    setLocation("");
    setNote("");
    setError(null);
    setDone(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    const startsAt = dt.date ? isoFromLocal(dt.date, dt.time, tz) : null;
    if (!startsAt) {
      setError("Pick a date.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await confirmSchedule([
      {
        title: title.trim(),
        startsAt,
        hasTime: dt.time !== null,
        location: location.trim() || undefined,
        note: note.trim() || undefined,
      },
    ]);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't add that.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto flex max-w-xl justify-end px-4 pb-6 sm:px-6">
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(true);
            }}
            aria-label="Add an event"
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg shadow-black/20 transition hover:scale-105 hover:bg-neutral-700 active:scale-95 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-neutral-900 sm:rounded-3xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                <CalendarPlus className="h-5 w-5 text-neutral-400" />
                Add an event
              </h2>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <Check className="h-7 w-7" strokeWidth={2.5} />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Added to your calendar</h3>
                <div className="mt-6 flex gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Add another
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <Field label="Event">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Dinner with Cedric"
                    autoFocus
                    className={inputCls}
                  />
                </Field>
                <div>
                  <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    When
                  </span>
                  <DateTimeField value={dt} onChange={setDt} />
                </div>
                <Field label="Location (optional)">
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Ferry Building"
                    className={inputCls}
                  />
                </Field>
                <Field label="Note (optional)">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="bring the tickets"
                    className={`${inputCls} resize-y`}
                  />
                </Field>

                {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

                <button
                  type="submit"
                  disabled={pending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Adding…
                    </>
                  ) : (
                    <>
                      <CalendarPlus className="h-4 w-4" /> Add to calendar
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</span>
      {children}
    </label>
  );
}
