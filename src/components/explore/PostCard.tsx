"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Loader2, Send } from "lucide-react";
import { addPostDates } from "@/app/date-post-actions";
import { createDirectEvent } from "@/app/poll-actions";
import { formatWhen } from "@/lib/localDateTime";
import { initials } from "@/lib/cardTypes";
import type { ExplorePost, PostDate } from "@/lib/explore";
import { DateLead } from "./DateLead";

export function whenOf(d: PostDate, tz: string): string {
  return formatWhen(d.startsAt, tz, !d.allDay);
}

/** Share a post's link through the phone's share sheet (or copy it). */
export function SharePost({ id, title, className }: { id: string; title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${window.location.origin}/post/${id}`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // share sheet dismissed
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? "Link copied" : "Send to a friend"}
      className={className ?? "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-900"}
    >
      {copied ? <Check className="h-4 w-4 text-green-700" /> : <Send className="h-4 w-4" strokeWidth={2.2} />}
    </button>
  );
}

/** Start a plan you host from one date on a post, then open it to invite people. */
export function useMakePlan(post: { title: string }, tz: string) {
  const router = useRouter();
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function make(d: PostDate) {
    if (making) return;
    setMaking(true);
    setError(null);
    const res = await createDirectEvent({
      title: d.label,
      eventTime: whenOf(d, tz),
      startsAt: d.startsAt,
      hasTime: !d.allDay,
      location: d.location ?? undefined,
      note: post.title !== d.label ? post.title : undefined,
      recipientIds: [],
      allowSolo: true,
    });
    if (!res.ok || !res.eventId) {
      setMaking(false);
      return setError(res.error ?? "Couldn't start the plan.");
    }
    router.push(`/event/${res.eventId}`);
  }
  return { make, making, error };
}

/** One post in Explore: photo, what it is, when — and a button that puts it on your calendar. */
export function PostCard({ post, tz }: { post: ExplorePost; tz: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set(post.dates.filter((d) => d.added).map((d) => d.id)));
  const [error, setError] = useState<string | null>(null);
  const plan = useMakePlan(post, tz);

  const multi = post.dates.length > 1;
  const next = post.next ?? post.dates[0];
  const left = post.dates.filter((d) => !addedIds.has(d.id));
  const allAdded = left.length === 0;

  async function add() {
    if (busy || allAdded) return;
    setBusy(true);
    setError(null);
    const ids = (multi ? left : [next]).map((d) => d.id);
    const res = await addPostDates(post.id, ids);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't add that.");
    setAddedIds((s) => new Set([...s, ...ids]));
    router.refresh();
  }

  return (
    <article className="overflow-hidden rounded-[22px] bg-white shadow-[0_10px_28px_rgba(46,33,29,0.08)]">
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <Link href={`/u/${post.author.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[12px] font-bold text-white">
            {initials(post.author.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold text-neutral-900">{post.mine ? "You" : post.author.name}</span>
            <span className="block text-[12px] text-neutral-500">{post.audience === "public" ? "Public" : "To friends"}</span>
          </span>
        </Link>
        {post.freeTag && (
          <span className="shrink-0 rounded-lg bg-green-100 px-2 py-1 text-[12px] font-bold text-green-800">{post.freeTag}</span>
        )}
      </div>

      <Link href={`/post/${post.id}`} className="block">
        {post.imageUrls[0] && (
          <span className="relative block aspect-[4/3] bg-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.imageUrls[0]} alt="" className="h-full w-full object-cover" />
            {multi && (
              <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[12px] font-bold text-white">
                <CalendarDays className="h-3.5 w-3.5" /> {post.dates.length} dates
              </span>
            )}
          </span>
        )}
        <span className="block space-y-2 px-3.5 pt-3">
          {post.imageUrls[0] ? (
            <>
              <span className="block text-[14px] font-bold text-fuchsia-800">
                {multi ? `${post.dates.length} dates · next ${whenOf(next, tz)}` : whenOf(next, tz)}
              </span>
              <span className="block text-[17px] font-bold leading-tight tracking-tight text-neutral-900">{post.title}</span>
              {(multi ? next.label : next.location) && (
                <span className="block truncate text-[14px] font-semibold text-neutral-900">{multi ? next.label : next.location}</span>
              )}
            </>
          ) : (
            // No photo: lead with the date, time and place instead of an empty picture.
            <DateLead
              top={new Date(next.startsAt).toLocaleDateString("en-US", { weekday: "short", timeZone: tz })}
              day={new Date(next.startsAt).toLocaleDateString("en-US", { day: "numeric", timeZone: tz })}
              when={multi ? `${post.dates.length} dates · next ${whenOf(next, tz)}` : whenOf(next, tz)}
              title={post.title}
              where={multi ? [next.label, next.location].filter(Boolean).join(" · ") : next.location}
            />
          )}
          {post.body && <span className="line-clamp-3 block text-[14px] leading-relaxed text-neutral-700">{post.body}</span>}
          {post.addedBy.length > 0 && (
            <span className="block text-[13px] font-semibold text-violet-700">
              {post.addedBy.slice(0, 2).join(" and ")}
              {post.addedBy.length > 2 ? ` +${post.addedBy.length - 2}` : ""} added this
            </span>
          )}
        </span>
      </Link>

      <div className="flex gap-2 p-3.5">
        <button
          type="button"
          onClick={add}
          disabled={busy || allAdded || (!multi && addedIds.has(next.id))}
          className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition disabled:opacity-70 ${
            multi ? "bg-fuchsia-700 text-white hover:bg-fuchsia-800" : "border border-neutral-200 bg-white text-neutral-900"
          }`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : allAdded || (!multi && addedIds.has(next.id)) ? (
            <>
              <Check className="h-4 w-4" /> On your calendar
            </>
          ) : multi ? (
            `Add ${left.length} ${left.length === 1 ? "date" : "dates"}`
          ) : (
            "Add to calendar"
          )}
        </button>
        {!multi && (
          <button
            type="button"
            onClick={() => plan.make(next)}
            disabled={plan.making}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-fuchsia-700 text-[14px] font-bold text-white transition hover:bg-fuchsia-800 disabled:opacity-60"
          >
            {plan.making && <Loader2 className="h-4 w-4 animate-spin" />} Make a plan
          </button>
        )}
        <SharePost id={post.id} title={post.title} />
      </div>
      {(error || plan.error) && <p className="px-3.5 pb-3 text-[13px] font-medium text-rose-700">{error || plan.error}</p>}
    </article>
  );
}
