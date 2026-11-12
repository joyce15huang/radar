"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { POST_IMAGES_BUCKET } from "@/lib/storage";
import { centerSquare, getCroppedFile } from "@/lib/cropImage";
import { clientTimeZone, formatWhen, isoFromLocal } from "@/lib/localDateTime";
import { createDatePost, findDatesInText } from "@/app/date-post-actions";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/explore";

interface Draft {
  label: string;
  startsAt: string;
  allDay: boolean;
  location?: string;
}
const MAX_IMAGES = 6;
const field =
  "w-full rounded-[14px] border border-neutral-200 bg-white px-3.5 text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200";
const cap = "text-[13px] font-semibold text-neutral-600";

/** Write a post. It has to carry at least one date — that's what people add to their calendar. */
export function PostCompose({ canPostPublic }: { canPostPublic: boolean }) {
  const router = useRouter();
  const tz = clientTimeZone();
  const fileInput = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [dates, setDates] = useState<Draft[]>([]);
  const [category, setCategory] = useState("");
  const [audience, setAudience] = useState<"friends" | "public">("friends");
  const [finding, setFinding] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nd, setNd] = useState({ label: "", date: "", time: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<number | null>(null);

  const sorted = [...dates].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  async function find() {
    if (finding) return;
    setFinding(true);
    setError(null);
    const res = await findDatesInText([title, body].filter(Boolean).join(". "));
    setFinding(false);
    if (!res.ok || !res.dates) return setError(res.error ?? "Couldn't find dates.");
    // Keep hand-added dates; replace nothing with the same label + time.
    setDates((cur) => {
      const have = new Set(cur.map((d) => `${d.label}|${Date.parse(d.startsAt)}`));
      return [...cur, ...res.dates!.filter((d) => !have.has(`${d.label}|${Date.parse(d.startsAt)}`))];
    });
    setFound(res.dates.length);
  }

  function addManual() {
    const startsAt = nd.date ? isoFromLocal(nd.date, nd.time || null, tz) : null;
    if (!nd.label.trim() || !startsAt) return setError("Give the date a name and a day.");
    setDates((cur) => [...cur, { label: nd.label.trim(), startsAt, allDay: !nd.time }]);
    setNd({ label: "", date: "", time: "" });
    setAdding(false);
    setError(null);
  }

  async function publish() {
    if (busy) return;
    if (!title.trim()) return setError("Give it a title.");
    if (dates.length === 0) return setError("A post needs at least one date.");
    setBusy(true);
    setError(null);
    try {
      const paths: string[] = [];
      if (images.length) {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("You're not signed in.");
        for (const img of images) {
          const cropped = await getCroppedFile(img.url, await centerSquare(img.url), `${crypto.randomUUID()}.jpg`);
          const path = `${user.id}/${crypto.randomUUID()}.jpg`;
          const up = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, cropped, { cacheControl: "3600", upsert: false });
          if (up.error) throw new Error(up.error.message);
          paths.push(path);
        }
      }
      const res = await createDatePost({ title, body, imagePaths: paths, dates, audience, category: category || undefined, sourceUrl: link || undefined });
      if (!res.ok || !res.id) throw new Error(res.error ?? "Couldn't post.");
      router.push(`/post/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {images.map((img, i) => (
          <span key={img.url} className="relative h-[104px] w-[104px] overflow-hidden rounded-2xl bg-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900/70 text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {images.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-[104px] w-[104px] flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] border-dashed border-neutral-300 text-neutral-600"
          >
            <Plus className="h-5 w-5" />
            <span className="text-[12px] font-semibold">{images.length ? "Another" : "Add photo"}</span>
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
            e.target.value = "";
            setImages((cur) => [...cur, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_IMAGES));
          }}
        />
      </div>

      <label className="block space-y-1.5">
        <span className={cap}>Title</span>
        <input className={`${field} h-12 text-[16px] font-bold`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Free museum days this winter" />
      </label>
      <label className="block space-y-1.5">
        <span className={cap}>What should people know?</span>
        <textarea
          className={`${field} resize-y py-3 text-[15px] leading-relaxed`}
          rows={4}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="de Young is free Dec 5, Cal Academy Dec 13. Book the Cal Academy slot ahead."
        />
      </label>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className={cap}>
            Dates{found !== null && <span className="font-medium text-green-700"> · found {found} in your text</span>}
          </h2>
          <span className="text-[12px] font-medium text-neutral-500">A post needs at least one</span>
        </div>
        <div className="rounded-2xl bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
          {sorted.length > 0 && (
            <ul className="divide-y divide-neutral-100">
              {sorted.map((d) => {
                const dt = new Date(d.startsAt);
                return (
                  <li key={`${d.label}|${d.startsAt}`} className="flex items-center gap-3 py-2 pl-3.5 pr-1">
                    <span className="flex w-10 shrink-0 flex-col items-center">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{dt.toLocaleDateString("en-US", { weekday: "short", timeZone: tz })}</span>
                      <span className="text-[16px] font-bold text-neutral-900">{dt.toLocaleDateString("en-US", { day: "numeric", timeZone: tz })}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-neutral-900">{d.label}</span>
                      <span className="block truncate text-[12px] text-neutral-500">{[formatWhen(d.startsAt, tz, !d.allDay), d.location].filter(Boolean).join(" · ")}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${d.label}`}
                      onClick={() => setDates((cur) => cur.filter((x) => x !== d))}
                      className="flex h-11 w-11 shrink-0 items-center justify-center text-neutral-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {adding ? (
            <div className="space-y-2 border-t border-neutral-100 p-3">
              <input className={`${field} h-11 text-[15px]`} value={nd.label} onChange={(e) => setNd({ ...nd, label: e.target.value })} placeholder="What happens that day" aria-label="Name of the date" maxLength={100} autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" aria-label="Day" className={`${field} h-11 text-[15px]`} value={nd.date} onChange={(e) => setNd({ ...nd, date: e.target.value })} />
                <input type="time" aria-label="Time (optional)" className={`${field} h-11 text-[15px]`} value={nd.time} onChange={(e) => setNd({ ...nd, time: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={addManual} className="h-11 flex-1 rounded-xl bg-neutral-900 text-[14px] font-semibold text-white">
                  Add date
                </button>
                <button type="button" onClick={() => setAdding(false)} className="h-11 px-3 text-[14px] font-semibold text-neutral-500">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className={`grid grid-cols-2 ${sorted.length ? "border-t border-neutral-100" : ""}`}>
              <button
                type="button"
                onClick={find}
                disabled={finding || (title + body).trim().length < 8}
                className="flex h-12 items-center justify-center gap-1.5 text-[14px] font-semibold text-fuchsia-800 disabled:opacity-40"
              >
                {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Find dates in my text
              </button>
              <button type="button" onClick={() => setAdding(true)} className="flex h-12 items-center justify-center gap-1.5 border-l border-neutral-100 text-[14px] font-semibold text-neutral-900">
                <Plus className="h-4 w-4" /> Add a date
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className={cap}>Kind (optional)</h2>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(category === c ? "" : c)}
              className={`h-9 rounded-full px-3.5 text-[13px] font-semibold ${
                category === c ? "bg-neutral-900 text-white" : "border border-neutral-200 bg-white text-neutral-900"
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </section>

      <label className="block space-y-1.5">
        <span className={cap}>Link for details (optional)</span>
        <input className={`${field} h-12 text-[15px]`} value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" placeholder="famsf.org/free-days" />
      </label>

      <section className="space-y-2">
        <h2 className={cap}>Who sees it</h2>
        <div role="group" aria-label="Who sees it" className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-neutral-200/70 p-1">
          {(["friends", "public"] as const).map((a) => {
            const off = a === "public" && !canPostPublic;
            return (
              <button
                key={a}
                type="button"
                aria-pressed={audience === a}
                disabled={off}
                onClick={() => setAudience(a)}
                className={`flex h-[50px] flex-col items-center justify-center rounded-[11px] transition ${
                  audience === a ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"
                } ${off ? "opacity-60" : ""}`}
              >
                <span className="text-[14px] font-bold">{a === "friends" ? "Friends" : "Everyone"}</span>
                <span className="text-[11px] font-medium">{a === "friends" ? "In their Explore" : canPostPublic ? "Public post" : "Public accounts only"}</span>
              </button>
            );
          })}
        </div>
      </section>

      {error && <p className="text-[13px] font-medium text-rose-700">{error}</p>}
      <button
        type="button"
        onClick={publish}
        disabled={busy}
        className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-700 text-[16px] font-bold text-white transition hover:bg-fuchsia-800 disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {audience === "public" ? "Post to everyone" : "Post to friends"}
      </button>
    </div>
  );
}
