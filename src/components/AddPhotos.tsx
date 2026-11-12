"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { POST_IMAGES_BUCKET } from "@/lib/storage";
import { centerSquare, getCroppedFile } from "@/lib/cropImage";
import { photoTakenAt, localDay } from "@/lib/photoDate";
import { clientTimeZone, formatWhen, isoFromLocal, localFromIso } from "@/lib/localDateTime";
import { createPost } from "@/app/create-card-actions";
import { createDirectEvent } from "@/app/poll-actions";
import { listMyPlansBetween, type PlanSpan } from "@/app/plan-photo-actions";

const MAX_PHOTOS = 40;
const PER_POST = 10;

interface Photo {
  file: File;
  url: string;
  day: string;
}
interface Group {
  key: string;
  photos: Photo[];
  /** A plan id, "new" (make a past plan), "skip", or "" (not decided). */
  choice: string;
  newTitle: string;
  changing: boolean;
}

function dayLabel(days: string[]): string {
  const uniq = [...new Set(days)].sort();
  const fmt = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return uniq.length === 1 ? fmt(uniq[0]) : `${fmt(uniq[0])} – ${fmt(uniq[uniq.length - 1])}`;
}

/**
 * Add photos from your phone and have them sorted into your plans by the day
 * they were taken. With `eventId`, everything goes to that one plan.
 */
export function AddPhotos({
  eventId,
  eventTitle,
  variant = "button",
}: {
  eventId?: string;
  eventTitle?: string;
  variant?: "button" | "tile";
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const tz = clientTimeZone();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [plans, setPlans] = useState<PlanSpan[]>([]);
  const [sorting, setSorting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<number | null>(null);
  // Survives a failed attempt so "try again" resumes instead of repeating.
  const made = useRef(new Map<string, string>());
  const posted = useRef(new Map<string, number>());
  const dirty = useRef(false);

  function close() {
    groups?.forEach((g) => g.photos.forEach((p) => URL.revokeObjectURL(p.url)));
    setGroups(null);
    setError(null);
    setProgress(null);
    if (finished !== null || dirty.current) router.refresh();
    setFinished(null);
    made.current.clear();
    posted.current.clear();
    dirty.current = false;
  }

  async function pick(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/")).slice(0, MAX_PHOTOS);
    if (images.length === 0) return;
    setSorting(true);
    setError(null);
    try {
      const photos: Photo[] = [];
      for (const file of images) {
        photos.push({ file, url: URL.createObjectURL(file), day: localDay(await photoTakenAt(file)) });
      }
      if (eventId) {
        setPlans([{ id: eventId, title: eventTitle ?? "This plan", startsAt: "", endsAt: null }]);
        setGroups([{ key: eventId, photos, choice: eventId, newTitle: "", changing: false }]);
        return;
      }
      const days = photos.map((p) => p.day).sort();
      const from = isoFromLocal(days[0], "00:00", tz);
      const toDay = new Date(Date.parse(`${days[days.length - 1]}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
      const to = isoFromLocal(toDay, "00:00", tz);
      const found = from && to ? await listMyPlansBetween(from, to) : [];
      setPlans(found);

      // Each photo goes to the plan whose day(s) cover the day it was taken.
      const spans = found.map((p) => {
        const start = localFromIso(p.startsAt, tz)?.date ?? "";
        const end = (p.endsAt && localFromIso(p.endsAt, tz)?.date) || start;
        return { id: p.id, start, end: end < start ? start : end };
      });
      const by = new Map<string, Group>();
      for (const ph of photos) {
        const hit = spans.find((s) => s.start === ph.day) ?? spans.find((s) => s.start <= ph.day && ph.day <= s.end);
        const key = hit ? hit.id : `day:${ph.day}`;
        const g = by.get(key) ?? { key, photos: [], choice: hit ? hit.id : "", newTitle: "", changing: false };
        g.photos.push(ph);
        by.set(key, g);
      }
      setGroups([...by.values()].sort((a, b) => (a.photos[0].day < b.photos[0].day ? 1 : -1)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read those photos.");
    } finally {
      setSorting(false);
    }
  }

  const patch = (key: string, p: Partial<Group>) =>
    setGroups((gs) => gs?.map((g) => (g.key === key ? { ...g, ...p } : g)) ?? null);

  const ready = (groups ?? []).filter((g) => (g.choice && g.choice !== "skip" && g.choice !== "new") || (g.choice === "new" && g.newTitle.trim()));
  const undecided = (groups ?? []).some((g) => g.choice === "" || (g.choice === "new" && !g.newTitle.trim()));
  const total = ready.reduce((n, g) => n + g.photos.length, 0);

  async function submit() {
    if (!groups || total === 0 || progress) return;
    setError(null);
    setProgress({ done: 0, total });
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You're not signed in.");
      let done = 0;
      for (const g of ready) {
        let target = made.current.get(g.key) ?? g.choice;
        if (target === "new") {
          const day = [...g.photos.map((p) => p.day)].sort()[0];
          const startsAt = isoFromLocal(day, null, tz);
          if (!startsAt) throw new Error("Couldn't read that date.");
          const res = await createDirectEvent({
            title: g.newTitle.trim(),
            eventTime: formatWhen(startsAt, tz, false),
            startsAt,
            hasTime: false,
            recipientIds: [],
            allowSolo: true,
          });
          if (!res.ok || !res.eventId) throw new Error(res.error ?? "Couldn't make that plan.");
          target = res.eventId;
          made.current.set(g.key, target);
          dirty.current = true;
        }
        const start = posted.current.get(g.key) ?? 0;
        done += start;
        for (let i = start; i < g.photos.length; i += PER_POST) {
          const batch = g.photos.slice(i, i + PER_POST);
          const paths: string[] = [];
          for (const ph of batch) {
            const cropped = await getCroppedFile(ph.url, await centerSquare(ph.url), `${crypto.randomUUID()}.jpg`);
            const path = `${user.id}/${crypto.randomUUID()}.jpg`;
            const up = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, cropped, { cacheControl: "3600", upsert: false });
            if (up.error) throw new Error(up.error.message);
            paths.push(path);
            setProgress({ done: done + paths.length, total });
          }
          done += batch.length;
          // One heads-up to the other guests per plan, not one per batch.
          const res = await createPost({ imagePaths: paths, eventId: target, takenOn: batch[0].day, onGrid: false, notify: i === 0 });
          if (!res.ok) throw new Error(res.error ?? "Couldn't add those photos.");
          posted.current.set(g.key, i + batch.length);
          dirty.current = true;
        }
      }
      setFinished(done);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Something went wrong."} Tap again to pick up where it stopped.`);
    } finally {
      setProgress(null);
    }
  }

  const titleOf = (id: string) => plans.find((p) => p.id === id)?.title ?? "Plan";
  const planCount = new Set(ready.map((g) => (g.choice === "new" ? g.key : g.choice))).size;

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void pick(files);
        }}
      />
      {variant === "tile" ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={sorting}
          className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-neutral-300 text-neutral-600 transition hover:bg-white/60"
        >
          {sorting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
          <span className="text-[13px] font-semibold">Add photos</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={sorting}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-fuchsia-700 px-3.5 text-[14px] font-semibold text-white transition hover:bg-fuchsia-800 disabled:opacity-60"
        >
          {sorting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Add photos
        </button>
      )}
      {error && !groups && <p className="mt-2 text-[13px] font-medium text-rose-700">{error}</p>}

      {groups && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={() => !progress && close()}>
          <div
            role="dialog"
            aria-label="Add photos"
            className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[26px] bg-white p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-[26px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-bold tracking-tight text-neutral-900">
                  {finished !== null ? `Added ${finished} ${finished === 1 ? "photo" : "photos"}` : `Add ${groups.reduce((n, g) => n + g.photos.length, 0)} photos`}
                </h2>
                {finished === null && !eventId && (
                  <p className="text-[13px] font-medium text-neutral-500">Sorted into plans by the day they were taken.</p>
                )}
              </div>
              <button type="button" onClick={close} disabled={!!progress} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {finished !== null ? (
              <button type="button" onClick={close} className="flex h-[52px] w-full items-center justify-center rounded-2xl bg-neutral-900 text-[15px] font-bold text-white">
                Done
              </button>
            ) : (
              <div className="space-y-3">
                {groups.map((g) => {
                  const isPlan = g.choice && g.choice !== "new" && g.choice !== "skip";
                  const meta = `${g.photos.length} ${g.photos.length === 1 ? "photo" : "photos"} · taken ${dayLabel(g.photos.map((p) => p.day))}`;
                  return (
                    <div key={g.key} className={`space-y-2.5 rounded-2xl p-3 ${isPlan ? "border border-neutral-200" : "border-[1.5px] border-dashed border-neutral-300"} ${g.choice === "skip" ? "opacity-60" : ""}`}>
                      <div className="flex items-center gap-2.5">
                        {isPlan && <Check className="h-[18px] w-[18px] shrink-0 text-green-700" strokeWidth={2.6} />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-bold text-neutral-900">
                            {isPlan ? titleOf(g.choice) : g.choice === "skip" ? "Left out" : `${g.photos.length} ${g.photos.length === 1 ? "photo" : "photos"} from ${dayLabel(g.photos.map((p) => p.day))}`}
                          </p>
                          <p className="text-[12px] text-neutral-500">{isPlan || g.choice === "skip" ? meta : "No plan on your calendar that day"}</p>
                        </div>
                        {!eventId && (isPlan || g.choice === "skip") && (
                          <button type="button" onClick={() => patch(g.key, g.choice === "skip" ? { choice: g.key.startsWith("day:") ? "" : g.key } : { changing: !g.changing })} className="h-9 shrink-0 px-2 text-[13px] font-semibold text-fuchsia-800">
                            {g.choice === "skip" ? "Undo" : "Change"}
                          </button>
                        )}
                      </div>

                      <div className="flex gap-1">
                        {g.photos.slice(0, g.photos.length > 5 ? 4 : 5).map((p) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={p.url} src={p.url} alt="" className="h-[52px] w-[52px] rounded-lg object-cover" />
                        ))}
                        {g.photos.length > 5 && (
                          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-lg bg-neutral-100 text-[13px] font-bold text-neutral-600">+{g.photos.length - 4}</span>
                        )}
                      </div>

                      {g.changing && (
                        <select
                          aria-label="Which plan"
                          value={g.choice}
                          onChange={(e) => patch(g.key, { choice: e.target.value, changing: false })}
                          className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[14px] text-neutral-900"
                        >
                          {!plans.some((p) => p.id === g.choice) && (
                            <option value={g.choice} disabled>
                              Pick a plan…
                            </option>
                          )}
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                          ))}
                          <option value="new">Make a new past plan…</option>
                          <option value="skip">Leave these out</option>
                        </select>
                      )}

                      {g.choice === "" && (
                        <div className="grid grid-cols-[1.3fr_1fr] gap-2">
                          <button type="button" onClick={() => patch(g.key, { choice: "new" })} className="h-[42px] rounded-xl bg-neutral-900 text-[14px] font-semibold text-white">
                            Make it a past plan
                          </button>
                          <button type="button" onClick={() => patch(g.key, { choice: "skip" })} className="h-[42px] rounded-xl border border-neutral-200 bg-white text-[14px] font-semibold text-neutral-900">
                            Leave out
                          </button>
                          {plans.length > 0 && (
                            <button type="button" onClick={() => patch(g.key, { changing: true })} className="col-span-2 h-9 text-[13px] font-semibold text-fuchsia-800">
                              Or pick one of your plans
                            </button>
                          )}
                        </div>
                      )}
                      {g.choice === "new" && (
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={g.newTitle}
                            onChange={(e) => patch(g.key, { newTitle: e.target.value })}
                            placeholder="What was it? e.g. Beach day"
                            aria-label="Name for the past plan"
                            maxLength={80}
                            className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-[15px] text-neutral-900 outline-none focus:border-neutral-400"
                          />
                          <button type="button" onClick={() => patch(g.key, { choice: "", newTitle: "" })} className="h-11 px-2 text-[13px] font-semibold text-neutral-500">
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                <p className="text-center text-[12px] font-medium text-neutral-500">Everyone on each plan can see its photos.</p>
                {error && <p className="text-center text-[13px] font-medium text-rose-700">{error}</p>}
                <button
                  type="button"
                  onClick={submit}
                  disabled={total === 0 || undecided || !!progress}
                  className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-700 text-[16px] font-bold text-white transition hover:bg-fuchsia-800 disabled:opacity-50"
                >
                  {progress ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Uploading {progress.done} of {progress.total}
                    </>
                  ) : undecided ? (
                    "Decide the rest first"
                  ) : (
                    `Add ${total} ${total === 1 ? "photo" : "photos"} to ${planCount} ${planCount === 1 ? "plan" : "plans"}`
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
