"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  Send,
  Loader2,
  PartyPopper,
  Check,
  Image as ImageIcon,
  CalendarClock,
  MapPin,
  Sparkles,
  ArrowLeft,
  Link2,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  sendCards,
  createPost,
  parseEventPreview,
  listMyEventsInRange,
  type RangeEvent,
} from "@/app/create-card-actions";
import { createClient } from "@/lib/supabase/client";
import { POST_IMAGES_BUCKET } from "@/lib/storage";
import { clientTimeZone, isoFromLocal, localFromIso } from "@/lib/localDateTime";
import type { ParsedEvent } from "@/lib/parse/schedule";

/** "YYYY-MM-DD" for a local calendar day. */
function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** [startISO, endISO) spanning the month (y, m) in the viewer's timezone. */
function monthWindow(y: number, m: number, tz: string): [string, string] | null {
  const first = dateKey(y, m, 1);
  const nextY = m === 11 ? y + 1 : y;
  const nextM = m === 11 ? 0 : m + 1;
  const start = isoFromLocal(first, "00:00", tz);
  const end = isoFromLocal(dateKey(nextY, nextM, 1), "00:00", tz);
  return start && end ? [start, end] : null;
}

type Mode = "invite" | "post";
const MAX_PHOTOS = 8;

interface Result {
  mode: Mode;
  sent?: number;
  notFound?: string[];
  sharedWith?: number;
}

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

/**
 * A single-purpose create button. `mode="invite"` lives on the Calendar tab;
 * `mode="post"` lives on the Profile tab. (Pings were removed.)
 */
export function CreateCardFab({ mode }: { mode: Mode }) {
  const tz = clientTimeZone();
  const today = localFromIso(new Date().toISOString(), tz)?.date ?? new Date().toISOString().slice(0, 10);

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Invite flow (parse → preview → send).
  const [recipients, setRecipients] = useState("");
  const [inviteText, setInviteText] = useState("");
  const [preview, setPreview] = useState<ParsedEvent | null>(null);

  // Post flow (multiple photos + a date whose events can be linked).
  const [postImages, setPostImages] = useState<{ file: File; url: string }[]>([]);
  const [takenOn, setTakenOn] = useState(today);
  const [viewMonth, setViewMonth] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [monthEvents, setMonthEvents] = useState<RangeEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);

  // Fetch the visible month's events once (dots the calendar + feeds the chips).
  useEffect(() => {
    if (!open || mode !== "post") return;
    const w = monthWindow(viewMonth.y, viewMonth.m, tz);
    if (!w) {
      setMonthEvents([]);
      return;
    }
    let live = true;
    setLoadingEvents(true);
    listMyEventsInRange(w[0], w[1])
      .then((evs) => live && setMonthEvents(evs))
      .catch(() => live && setMonthEvents([]))
      .finally(() => live && setLoadingEvents(false));
    return () => {
      live = false;
    };
  }, [open, mode, viewMonth, tz]);

  // Which local days in the loaded month carry at least one event (for dots).
  const eventDays = useMemo(() => {
    const s = new Set<string>();
    for (const e of monthEvents) {
      const d = localFromIso(e.startsAt, tz)?.date;
      if (d) s.add(d);
    }
    return s;
  }, [monthEvents, tz]);

  // The selected day's events — offered as link targets — from the same fetch.
  const dayEvents = useMemo(
    () => monthEvents.filter((e) => localFromIso(e.startsAt, tz)?.date === takenOn),
    [monthEvents, takenOn, tz],
  );

  // Drop a stale event link if the chosen day no longer includes it.
  useEffect(() => {
    setSelectedEventId((prev) => (prev && dayEvents.some((e) => e.id === prev) ? prev : null));
  }, [dayEvents]);

  function clearImages() {
    setPostImages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
  }
  function reset() {
    setError(null);
    setResult(null);
    setPreview(null);
    setInviteText("");
    setRecipients("");
    clearImages();
    setTakenOn(today);
    const [ty, tm] = today.split("-").map(Number);
    setViewMonth({ y: ty, m: tm - 1 });
    setSelectedEventId(null);
    setMonthEvents([]);
    setCalOpen(false);
  }
  function close() {
    if (pending) return;
    setOpen(false);
  }

  function addFiles(picked: File[]) {
    if (picked.length === 0) return;
    const room = Math.max(0, MAX_PHOTOS - postImages.length);
    if (room === 0) return;
    // Build the previews synchronously from a real array snapshot (not the live
    // FileList, which the input clears after onChange).
    const mapped = picked
      .slice(0, room)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPostImages((prev) => [...prev, ...mapped]);
  }
  function removeImage(idx: number) {
    setPostImages((prev) => {
      const next = [...prev];
      const [gone] = next.splice(idx, 1);
      if (gone) URL.revokeObjectURL(gone.url);
      return next;
    });
  }

  async function handlePost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (postImages.length === 0) {
      setError("Choose at least one photo.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You're not signed in.");

      const paths: string[] = [];
      for (const { file } of postImages) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (up.error) throw new Error(up.error.message);
        paths.push(path);
      }

      const res = await createPost({
        caption: String(fd.get("caption") ?? ""),
        imagePaths: paths,
        eventId: selectedEventId,
        takenOn,
      });
      if (!res.ok) throw new Error(res.error ?? "Couldn't publish the post.");
      setResult({ mode: "post", sharedWith: res.sharedWith });
      clearImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function doPreview() {
    if (!inviteText.trim()) {
      setError("Describe the event.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await parseEventPreview(inviteText);
    setPending(false);
    if (!res.ok || !res.event) {
      setError(res.error ?? "Couldn't read that event.");
      return;
    }
    setPreview(res.event);
  }

  async function doSendInvite() {
    const list = recipients.split(/[\s,]+/).filter(Boolean);
    if (list.length === 0) {
      setError("Add at least one email.");
      return;
    }
    if (!preview) return;
    setPending(true);
    setError(null);
    const res = await sendCards({
      type: "social_invite",
      recipients: list,
      eventTitle: preview.title,
      eventTime: preview.when,
      startsAt: preview.startsAt,
      location: preview.location,
      note: preview.note,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't send.");
      return;
    }
    setResult({ mode: "invite", sent: res.sent, notFound: res.notFound });
  }

  const title = mode === "invite" ? "New event" : "New post";

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto flex max-w-xl justify-end px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6">
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(true);
            }}
            aria-label={title}
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg shadow-black/20 transition hover:scale-105 hover:bg-neutral-700 active:scale-95 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={close}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-neutral-900 sm:rounded-3xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            {result ? (
              <SentPanel result={result} onClose={() => setOpen(false)} onAgain={reset} />
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                    {mode === "invite" ? (
                      <PartyPopper className="h-5 w-5 text-neutral-400" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-neutral-400" />
                    )}
                    {title}
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {mode === "invite" ? (
                  <div className="space-y-3">
                    <Field label="Friends' emails">
                      <input
                        type="text"
                        value={recipients}
                        onChange={(e) => setRecipients(e.target.value)}
                        placeholder="ada@x.com, grace@y.com"
                        className={inputCls}
                      />
                      <span className="mt-1 block text-xs text-neutral-400">
                        Separate multiple emails with commas or spaces.
                      </span>
                    </Field>

                    {!preview ? (
                      <>
                        <Field label="What's the plan?">
                          <textarea
                            rows={3}
                            value={inviteText}
                            onChange={(e) => setInviteText(e.target.value)}
                            placeholder="rooftop dinner this Saturday 7pm at my place, bring snacks"
                            className={`${inputCls} resize-y`}
                          />
                        </Field>
                        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                        <button
                          type="button"
                          onClick={doPreview}
                          disabled={pending}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                        >
                          {pending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Reading it…
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" /> Preview event
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
                          <h3 className="text-[1.05rem] font-semibold text-neutral-900 dark:text-neutral-50">
                            {preview.title}
                          </h3>
                          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                            <CalendarClock className="h-4 w-4 text-neutral-400" />
                            {preview.when}
                          </p>
                          {preview.location && (
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
                              <MapPin className="h-4 w-4 text-neutral-400" />
                              {preview.location}
                            </p>
                          )}
                          {preview.note && (
                            <p className="mt-1 text-sm italic text-neutral-500 dark:text-neutral-400">
                              {preview.note}
                            </p>
                          )}
                        </div>
                        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPreview(null);
                              setError(null);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                          >
                            <ArrowLeft className="h-4 w-4" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={doSendInvite}
                            disabled={pending}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                          >
                            {pending ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4" /> Send invite
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-center text-xs text-neutral-400 dark:text-neutral-600">
                          No notification, no read receipt — they find it in tomorrow&rsquo;s deck.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handlePost} className="space-y-3">
                    {/* Not wrapped in <label>: a label would forward clicks on the
                        thumbnails' remove buttons to the file input. */}
                    <div>
                      <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        Photos
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const picked = Array.from(e.target.files ?? []);
                          e.currentTarget.value = "";
                          addFiles(picked);
                        }}
                        className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-700 dark:text-neutral-300 dark:file:bg-white dark:file:text-neutral-900"
                      />
                      <span className="mt-1 block text-xs text-neutral-400">
                        Add up to {MAX_PHOTOS}. They become one swipeable card.
                      </span>
                      {postImages.length > 0 && (
                        <div className="mt-2 grid grid-cols-4 gap-2">
                          {postImages.map((img, i) => (
                            <div
                              key={img.url}
                              className="relative aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img.url} alt="" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeImage(i)}
                                aria-label="Remove photo"
                                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white transition hover:bg-black/80"
                              >
                                <X className="h-3 w-3" strokeWidth={2.5} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Field label="Caption (optional)">
                      <textarea
                        name="caption"
                        rows={2}
                        placeholder="what's the moment?"
                        className={`${inputCls} resize-y`}
                      />
                    </Field>

                    <div>
                      <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        Date
                      </span>
                      <button
                        type="button"
                        onClick={() => setCalOpen((o) => !o)}
                        aria-expanded={calOpen}
                        className={`${inputCls} flex items-center justify-between text-left`}
                      >
                        <span className="text-neutral-900 dark:text-neutral-100">
                          {formatTaken(takenOn, today)}
                        </span>
                        <CalendarIcon
                          className={`h-4 w-4 transition ${
                            calOpen ? "text-neutral-700 dark:text-neutral-200" : "text-neutral-400"
                          }`}
                        />
                      </button>
                      {calOpen && (
                        <div className="mt-2">
                          <MonthCalendar
                            view={viewMonth}
                            selected={takenOn}
                            today={today}
                            eventDays={eventDays}
                            onSelect={(d) => {
                              setTakenOn(d);
                              setCalOpen(false);
                            }}
                            onPrev={() =>
                              setViewMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))
                            }
                            onNext={() =>
                              setViewMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))
                            }
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        Link to an event (optional)
                      </span>
                      {loadingEvents ? (
                        <p className="text-xs text-neutral-400 dark:text-neutral-500">Checking your calendar…</p>
                      ) : dayEvents.length === 0 ? (
                        <p className="text-xs text-neutral-400 dark:text-neutral-500">
                          No events on your calendar that day — this just goes to your profile.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {dayEvents.map((ev) => {
                            const on = selectedEventId === ev.id;
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => setSelectedEventId(on ? null : ev.id)}
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                  on
                                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                                    : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                }`}
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                {ev.title}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {selectedEventId && (
                        <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                          Shared with everyone on this event too.
                        </p>
                      )}
                    </div>

                    {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

                    <button
                      type="submit"
                      disabled={pending}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                    >
                      {pending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Publishing…
                        </>
                      ) : (
                        <>
                          <ImageIcon className="h-4 w-4" /> Publish post
                        </>
                      )}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** "Today" for the current day, otherwise "Wed, Sep 3" (with year if not this year). */
function formatTaken(date: string, today: string): string {
  if (date === today) return "Today";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Inline month picker. Days with an event on the actor's calendar get a dot;
 *  future days are disabled (a post is dated to when the moment happened). */
function MonthCalendar({
  view,
  selected,
  today,
  eventDays,
  onSelect,
  onPrev,
  onNext,
}: {
  view: { y: number; m: number };
  selected: string;
  today: string;
  eventDays: Set<string>;
  onSelect: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { y, m } = view;
  const leading = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const [ty, tm] = today.split("-").map(Number);
  const canGoNext = y < ty || (y === ty && m < tm - 1);
  const monthLabel = new Date(y, m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const cells: (number | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous month"
          className="rounded-lg p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{monthLabel}</span>
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          aria-label="Next month"
          className="rounded-lg p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:pointer-events-none disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[0.65rem] font-medium text-neutral-400 dark:text-neutral-600">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const ds = dateKey(y, m, d);
          const disabled = ds > today;
          const isSelected = ds === selected;
          const hasEvent = eventDays.has(ds);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(ds)}
              className={`relative flex aspect-square items-center justify-center rounded-lg text-sm transition ${
                isSelected
                  ? "bg-neutral-900 font-semibold text-white dark:bg-white dark:text-neutral-900"
                  : disabled
                    ? "text-neutral-300 dark:text-neutral-700"
                    : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              }`}
            >
              {d}
              {hasEvent && (
                <span
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${
                    isSelected ? "bg-white dark:bg-neutral-900" : "bg-fuchsia-500 dark:bg-fuchsia-400"
                  }`}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
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

function SentPanel({
  result,
  onClose,
  onAgain,
}: {
  result: Result;
  onClose: () => void;
  onAgain: () => void;
}) {
  let title = "Done";
  let body = "";
  if (result.mode === "post") {
    title = "Posted";
    body =
      result.sharedWith && result.sharedWith > 0
        ? `It's on your profile and shared with ${result.sharedWith} attendee${result.sharedWith === 1 ? "" : "s"}.`
        : "It's up on your profile.";
  } else {
    title = "Invite sent";
    const n = result.sent ?? 0;
    body = `Delivered to ${n} deck${n === 1 ? "" : "s"}.`;
    if (result.notFound && result.notFound.length > 0) {
      body += ` Not on the app yet: ${result.notFound.join(", ")}.`;
    }
  }

  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400">
        <Check className="h-7 w-7" strokeWidth={2.5} />
      </div>
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">{body}</p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onAgain}
          className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Create another
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Done
        </button>
      </div>
    </div>
  );
}
