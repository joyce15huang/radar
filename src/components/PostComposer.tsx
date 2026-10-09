"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import {
  Plus,
  X,
  Check,
  Loader2,
  ArrowLeft,
  ImagePlus,
  Link2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
} from "lucide-react";
import { createPost, listMyEventsInRange, type RangeEvent } from "@/app/create-card-actions";
import { createClient } from "@/lib/supabase/client";
import { POST_IMAGES_BUCKET } from "@/lib/storage";
import { clientTimeZone, isoFromLocal, localFromIso } from "@/lib/localDateTime";
import { getCroppedFile, centerSquare, type CropPixels } from "@/lib/cropImage";

const MAX_PHOTOS = 10;

interface Img {
  file: File;
  url: string;
}
interface CropState {
  crop: { x: number; y: number };
  zoom: number;
  pixels: CropPixels | null;
}
type Step = "select" | "edit" | "date";

const newCrop = (): CropState => ({ crop: { x: 0, y: 0 }, zoom: 1, pixels: null });

/** Instagram-style post composer: Select → Crop & caption → Date → Share. */
export function PostComposer({
  eventId,
  eventDate,
  variant = "fab",
}: {
  /** Open already linked to this event (e.g. "Add photos" on an event page). */
  eventId?: string;
  /** The event's day (YYYY-MM-DD); the post is dated to it when it's not in the future. */
  eventDate?: string | null;
  /** "fab" = floating + button; "button" = an inline "Add" pill. */
  variant?: "fab" | "button";
} = {}) {
  const tz = clientTimeZone();
  const today = localFromIso(new Date().toISOString(), tz)?.date ?? new Date().toISOString().slice(0, 10);
  const startDate = eventDate && eventDate <= today ? eventDate : today;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneWith, setDoneWith] = useState<number | null>(null);

  const [images, setImages] = useState<Img[]>([]);
  const [crops, setCrops] = useState<CropState[]>([]);
  const [editIndex, setEditIndex] = useState(0);
  const [caption, setCaption] = useState("");

  const [takenOn, setTakenOn] = useState(startDate);
  const [viewMonth, setViewMonth] = useState(() => {
    const [y, m] = startDate.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [monthEvents, setMonthEvents] = useState<RangeEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(eventId ?? null);
  const [monthLoaded, setMonthLoaded] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // Load the visible month's events on the Date step (dots + link chips).
  useEffect(() => {
    if (!open || step !== "date") return;
    const w = monthWindow(viewMonth.y, viewMonth.m, tz);
    if (!w) return setMonthEvents([]);
    let live = true;
    setMonthLoaded(false);
    listMyEventsInRange(w[0], w[1])
      .then((evs) => {
        if (!live) return;
        setMonthEvents(evs);
        setMonthLoaded(true);
      })
      .catch(() => {
        if (!live) return;
        setMonthEvents([]);
        setMonthLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [open, step, viewMonth, tz]);

  const eventDays = useMemo(() => {
    const s = new Set<string>();
    for (const e of monthEvents) {
      const d = localFromIso(e.startsAt, tz)?.date;
      if (d) s.add(d);
    }
    return s;
  }, [monthEvents, tz]);

  const dayEvents = useMemo(
    () => monthEvents.filter((e) => localFromIso(e.startsAt, tz)?.date === takenOn),
    [monthEvents, takenOn, tz],
  );

  // Drop a linked event that isn't on the chosen day — but only once that
  // month's events have actually loaded (so a preset link isn't wiped early).
  useEffect(() => {
    if (!monthLoaded) return;
    setSelectedEventId((prev) => (prev && dayEvents.some((e) => e.id === prev) ? prev : null));
  }, [dayEvents, monthLoaded]);

  function clearImages() {
    setImages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
    setCrops([]);
  }
  function reset() {
    clearImages();
    setStep("select");
    setError(null);
    setDoneWith(null);
    setEditIndex(0);
    setCaption("");
    setTakenOn(startDate);
    const [y, m] = startDate.split("-").map(Number);
    setViewMonth({ y, m: m - 1 });
    setSelectedEventId(eventId ?? null);
    setMonthEvents([]);
  }

  function addFiles(picked: File[]) {
    const imgs = picked.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    setImages((prev) => {
      const room = Math.max(0, MAX_PHOTOS - prev.length);
      const mapped = imgs.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }));
      if (mapped.length) setCrops((c) => [...c, ...mapped.map(newCrop)]);
      return [...prev, ...mapped];
    });
  }
  function removeImage(i: number) {
    setImages((prev) => {
      const next = [...prev];
      const [gone] = next.splice(i, 1);
      if (gone) URL.revokeObjectURL(gone.url);
      return next;
    });
    setCrops((prev) => prev.filter((_, idx) => idx !== i));
    setEditIndex((idx) => Math.max(0, Math.min(idx, images.length - 2)));
  }

  function patchCrop(i: number, patch: Partial<CropState>) {
    setCrops((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function publish() {
    if (images.length === 0) return;
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You're not signed in.");

      const paths: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const px = crops[i]?.pixels ?? (await centerSquare(images[i].url));
        const cropped = await getCroppedFile(images[i].url, px, `${crypto.randomUUID()}.jpg`);
        const path = `${user.id}/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage
          .from(POST_IMAGES_BUCKET)
          .upload(path, cropped, { cacheControl: "3600", upsert: false });
        if (up.error) throw new Error(up.error.message);
        paths.push(path);
      }

      const res = await createPost({
        caption,
        imagePaths: paths,
        eventId: selectedEventId,
        takenOn,
      });
      if (!res.ok) throw new Error(res.error ?? "Couldn't publish the post.");
      setDoneWith(res.sharedWith ?? 0);
      clearImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const canClose = !pending;

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(true);
          }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-fuchsia-700 px-3.5 text-sm font-semibold text-white transition hover:bg-fuchsia-800"
        >
          <ImagePlus className="h-4 w-4" /> Add
        </button>
      ) : (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
          <div className="mx-auto flex max-w-xl justify-end px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6">
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(true);
              }}
              aria-label="New post"
              className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg shadow-black/20 transition hover:scale-105 hover:bg-neutral-700 active:scale-95"
            >
              <Plus className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => canClose && setOpen(false)}
        >
          <div
            className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl dark:bg-neutral-900 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {doneWith !== null ? (
              <DonePanel sharedWith={doneWith} onClose={() => setOpen(false)} onAgain={reset} />
            ) : (
              <>
                <Header
                  step={step}
                  pending={pending}
                  canNext={images.length > 0}
                  onClose={() => canClose && setOpen(false)}
                  onBack={() => setStep(step === "date" ? "edit" : "select")}
                  onNext={() => {
                    setError(null);
                    if (step === "select") setStep("edit");
                    else if (step === "edit") setStep("date");
                    else void publish();
                  }}
                />

                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {step === "select" && (
                    <SelectStep
                      images={images}
                      fileRef={fileRef}
                      onFiles={addFiles}
                      onRemove={removeImage}
                      count={images.length}
                    />
                  )}

                  {step === "edit" && images[editIndex] && (
                    <EditStep
                      images={images}
                      crops={crops}
                      editIndex={editIndex}
                      setEditIndex={setEditIndex}
                      patchCrop={patchCrop}
                      caption={caption}
                      setCaption={setCaption}
                    />
                  )}

                  {step === "date" && (
                    <DateStep
                      today={today}
                      takenOn={takenOn}
                      setTakenOn={setTakenOn}
                      viewMonth={viewMonth}
                      setViewMonth={setViewMonth}
                      eventDays={eventDays}
                      dayEvents={dayEvents}
                      selectedEventId={selectedEventId}
                      setSelectedEventId={setSelectedEventId}
                    />
                  )}

                  {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Header({
  step,
  pending,
  canNext,
  onClose,
  onBack,
  onNext,
}: {
  step: Step;
  pending: boolean;
  canNext: boolean;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const title = step === "select" ? "New post" : step === "edit" ? "Crop & caption" : "When was this?";
  const right = step === "date" ? "Share" : "Next";
  return (
    <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      {step === "select" ? (
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <X className="h-5 w-5" />
        </button>
      ) : (
        <button type="button" onClick={onBack} aria-label="Back" className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext || pending}
        className="inline-flex items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-sky-600 transition hover:text-sky-500 disabled:opacity-40 dark:text-sky-400"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : right}
      </button>
    </div>
  );
}

function SelectStep({
  images,
  fileRef,
  onFiles,
  onRemove,
  count,
}: {
  images: Img[];
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (f: File[]) => void;
  onRemove: (i: number) => void;
  count: number;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.currentTarget.value = "";
          onFiles(picked);
        }}
      />
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(Array.from(e.dataTransfer.files ?? []));
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragging
            ? "border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-500/10"
            : "border-neutral-300 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600"
        }`}
      >
        <ImagePlus className="h-10 w-10 text-neutral-300 dark:text-neutral-600" strokeWidth={1.5} />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Drag photos here</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileRef.current?.click();
          }}
          className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Select from device
        </button>
        <p className="text-xs text-neutral-400 dark:text-neutral-600">Up to {MAX_PHOTOS} photos · they become one swipeable post</p>
      </div>

      {count > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((img, i) => (
            <div key={img.url} className="relative aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
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
  );
}

function EditStep({
  images,
  crops,
  editIndex,
  setEditIndex,
  patchCrop,
  caption,
  setCaption,
}: {
  images: Img[];
  crops: CropState[];
  editIndex: number;
  setEditIndex: (i: number) => void;
  patchCrop: (i: number, patch: Partial<CropState>) => void;
  caption: string;
  setCaption: (s: string) => void;
}) {
  const cs = crops[editIndex] ?? newCrop();
  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-neutral-900">
        <Cropper
          image={images[editIndex].url}
          crop={cs.crop}
          zoom={cs.zoom}
          aspect={1}
          showGrid
          onCropChange={(crop) => patchCrop(editIndex, { crop })}
          onZoomChange={(zoom) => patchCrop(editIndex, { zoom })}
          onCropComplete={(_area, pixels) => patchCrop(editIndex, { pixels })}
        />
      </div>

      <div className="flex items-center gap-2">
        <ZoomIn className="h-4 w-4 shrink-0 text-neutral-400" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={cs.zoom}
          onChange={(e) => patchCrop(editIndex, { zoom: Number(e.target.value) })}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-neutral-900 dark:bg-neutral-700 dark:accent-white"
        />
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setEditIndex(i)}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                i === editIndex ? "border-neutral-900 dark:border-white" : "border-transparent opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={2}
        placeholder="Write a caption…"
        className="w-full resize-y rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700"
      />
    </div>
  );
}

function DateStep({
  today,
  takenOn,
  setTakenOn,
  viewMonth,
  setViewMonth,
  eventDays,
  dayEvents,
  selectedEventId,
  setSelectedEventId,
}: {
  today: string;
  takenOn: string;
  setTakenOn: (d: string) => void;
  viewMonth: { y: number; m: number };
  setViewMonth: React.Dispatch<React.SetStateAction<{ y: number; m: number }>>;
  eventDays: Set<string>;
  dayEvents: RangeEvent[];
  selectedEventId: string | null;
  setSelectedEventId: (id: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <MonthCalendar
        view={viewMonth}
        selected={takenOn}
        today={today}
        eventDays={eventDays}
        onSelect={setTakenOn}
        onPrev={() => setViewMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}
        onNext={() => setViewMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}
      />

      <div>
        <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Link to an event (optional)
        </span>
        {dayEvents.length === 0 ? (
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
          <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">Shared with everyone on this event too.</p>
        )}
      </div>
    </div>
  );
}

function DonePanel({ sharedWith, onClose, onAgain }: { sharedWith: number; onClose: () => void; onAgain: () => void }) {
  const body =
    sharedWith > 0
      ? `It's on your profile and shared with ${sharedWith} attendee${sharedWith === 1 ? "" : "s"}.`
      : "It's up on your profile.";
  return (
    <div className="flex flex-col items-center px-5 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400">
        <Check className="h-7 w-7" strokeWidth={2.5} />
      </div>
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Posted</h2>
      <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">{body}</p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onAgain}
          className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          New post
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

// ── Month calendar (photo date) ─────────────────────────────────────────────

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function monthWindow(y: number, m: number, tz: string): [string, string] | null {
  const first = dateKey(y, m, 1);
  const nextY = m === 11 ? y + 1 : y;
  const nextM = m === 11 ? 0 : m + 1;
  const start = isoFromLocal(first, "00:00", tz);
  const end = isoFromLocal(dateKey(nextY, nextM, 1), "00:00", tz);
  return start && end ? [start, end] : null;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

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
        <button type="button" onClick={onPrev} aria-label="Previous month" className="rounded-lg p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{monthLabel}</span>
        <button type="button" onClick={onNext} disabled={!canGoNext} aria-label="Next month" className="rounded-lg p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:pointer-events-none disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100">
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
                <span className={`absolute bottom-1 h-1 w-1 rounded-full ${isSelected ? "bg-white dark:bg-neutral-900" : "bg-fuchsia-500 dark:bg-fuchsia-400"}`} aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
