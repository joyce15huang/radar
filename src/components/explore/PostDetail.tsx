"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";
import { addPostDates, deleteDatePost } from "@/app/date-post-actions";
import { initials } from "@/lib/cardTypes";
import type { ExplorePost } from "@/lib/explore";
import { SharePost, useMakePlan, whenOf } from "./PostCard";

/** A post opened up: photos, text, and its dates as a checklist you add from. */
export function PostDetail({ post, tz }: { post: ExplorePost; tz: string }) {
  const router = useRouter();
  const upcoming = post.dates.filter((d) => Date.parse(d.startsAt) > Date.now() - 86_400_000);
  const [added, setAdded] = useState<Set<string>>(() => new Set(post.dates.filter((d) => d.added).map((d) => d.id)));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(upcoming.filter((d) => !d.added).map((d) => d.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const plan = useMakePlan(post, tz);
  const pickable = post.dates.filter((d) => !added.has(d.id));
  const count = [...picked].filter((id) => !added.has(id)).length;

  async function add() {
    if (busy || count === 0) return;
    setBusy(true);
    setError(null);
    const ids = [...picked].filter((id) => !added.has(id));
    const res = await addPostDates(post.id, ids);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't add those.");
    setAdded((s) => new Set([...s, ...ids]));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <Link href={`/u/${post.author.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[13px] font-bold text-white">
            {initials(post.author.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold text-neutral-900">{post.mine ? "You" : post.author.name}</span>
            <span className="block text-[12px] text-neutral-500">{post.audience === "public" ? "Public" : "To friends"}</span>
          </span>
        </Link>
        <SharePost id={post.id} title={post.title} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-900 hover:bg-neutral-200/60" />
      </div>

      {post.imageUrls.length > 0 && (
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none]">
          {post.imageUrls.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="" className={`aspect-[4/3] shrink-0 snap-center rounded-[20px] bg-neutral-200 object-cover ${post.imageUrls.length > 1 ? "w-[88%]" : "w-full"}`} />
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-neutral-900">{post.title}</h1>
        {post.body && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-700">{post.body}</p>}
        {post.sourceUrl && (
          <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-[13px] font-semibold text-fuchsia-800 hover:underline">
            Original details
          </a>
        )}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-neutral-900">
            {post.dates.length} {post.dates.length === 1 ? "date" : "dates"}
          </h2>
          {pickable.length > 1 && (
            <button
              type="button"
              onClick={() => setPicked(count === pickable.length ? new Set() : new Set(pickable.map((d) => d.id)))}
              className="h-9 px-1 text-[13px] font-semibold text-fuchsia-800"
            >
              {count === pickable.length ? "Clear" : "Select all"}
            </button>
          )}
        </div>
        <ul className="divide-y divide-neutral-100 rounded-[18px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
          {post.dates.map((d) => {
            const isAdded = added.has(d.id);
            const on = isAdded || picked.has(d.id);
            const dt = new Date(d.startsAt);
            return (
              <li key={d.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="flex w-10 shrink-0 flex-col items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                    {dt.toLocaleDateString("en-US", { weekday: "short", timeZone: tz })}
                  </span>
                  <span className="text-[16px] font-bold text-neutral-900">{dt.toLocaleDateString("en-US", { day: "numeric", timeZone: tz })}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-neutral-900">{d.label}</span>
                  <span className="block truncate text-[12px] text-neutral-500">{[whenOf(d, tz), d.location].filter(Boolean).join(" · ")}</span>
                </span>
                <button
                  type="button"
                  onClick={() => plan.make(d)}
                  disabled={plan.making}
                  className="h-9 shrink-0 rounded-lg px-2 text-[12px] font-bold text-fuchsia-800 hover:bg-fuchsia-50"
                >
                  Plan
                </button>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={isAdded ? `${d.label} is on your calendar` : `Add ${d.label}`}
                  disabled={isAdded}
                  onClick={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (n.has(d.id)) n.delete(d.id);
                      else n.add(d.id);
                      return n;
                    })
                  }
                  className="flex h-11 w-9 shrink-0 items-center justify-center"
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                      isAdded ? "bg-green-700" : on ? "bg-fuchsia-700" : "border-2 border-neutral-300"
                    }`}
                  >
                    {on && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.2} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {(error || plan.error) && <p className="text-[13px] font-medium text-rose-700">{error || plan.error}</p>}
      <button
        type="button"
        onClick={add}
        disabled={busy || count === 0}
        className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-700 text-[16px] font-bold text-white transition hover:bg-fuchsia-800 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : pickable.length === 0 ? (
          <>
            <Check className="h-4 w-4" /> All on your calendar
          </>
        ) : (
          `Add ${count} ${count === 1 ? "date" : "dates"} to my calendar`
        )}
      </button>

      {post.mine && (
        <button
          type="button"
          onClick={async () => {
            if (!sure) return setSure(true);
            await deleteDatePost(post.id);
            router.push("/today");
          }}
          className="mx-auto flex h-11 items-center gap-1.5 text-[14px] font-semibold text-neutral-500 hover:text-rose-700"
        >
          <Trash2 className="h-4 w-4" /> {sure ? "Tap again to delete this post" : "Delete post"}
        </button>
      )}
    </div>
  );
}
