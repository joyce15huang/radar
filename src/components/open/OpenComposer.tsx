"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { clientTimeZone, localFromIso } from "@/lib/localDateTime";
import { AUDIENCES, type Audience } from "@/lib/openPosts";
import { createOpenPost } from "@/app/open-post-actions";
import { Avatar } from "./OpenPostItem";
import { addDays, dayLabel, timeLabel } from "@/lib/itinerary";

/** Write it like a text; pick the day (needed) and a time (optional); post. */
export function OpenComposer({
  meId,
  meName,
  initialBody = "",
  initialDay,
}: {
  meId: string;
  meName: string;
  initialBody?: string;
  initialDay?: string;
}) {
  const router = useRouter();
  const tz = clientTimeZone();
  const today = useMemo(() => localFromIso(new Date().toISOString(), tz)?.date ?? new Date().toISOString().slice(0, 10), [tz]);
  const [body, setBody] = useState(initialBody);
  const [day, setDay] = useState(initialDay && initialDay >= today ? initialDay : today);
  const [time, setTime] = useState("");
  const [showTime, setShowTime] = useState(false);
  const [audience, setAudience] = useState<Audience>("fof");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quick = [
    { key: today, label: "Today" },
    { key: addDays(today, 1), label: "Tomorrow" },
  ];
  const custom = !quick.some((q) => q.key === day);

  async function post() {
    if (sending) return;
    if (!body.trim()) return setError("Write something first.");
    setSending(true);
    setError(null);
    const res = await createOpenPost({ body, day, time: time || null, audience, tz });
    setSending(false);
    if (!res.ok) return setError(res.error ?? "Couldn't post that.");
    router.push("/today");
    router.refresh();
  }

  const opt = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[13px] ${on ? "border-neutral-900 bg-neutral-900 font-semibold text-white" : "border-neutral-300 text-neutral-600"}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex h-14 items-center justify-between border-b border-neutral-200">
        <Link href="/today" className="text-[15px] text-neutral-900">
          Cancel
        </Link>
        <span className="text-[16px] font-bold text-neutral-900">New post</span>
        <span className="w-[52px]" />
      </div>

      <div className="flex flex-1 gap-3 pt-4">
        <Avatar id={meId} name={meName} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-neutral-900">{meName}</p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoFocus
            rows={3}
            maxLength={500}
            placeholder="What are you up for?"
            aria-label="Post"
            className="mt-0.5 w-full resize-none bg-transparent text-[17px] leading-[1.5] text-neutral-900 outline-none placeholder:text-neutral-400"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />

          <div className="mt-3 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {quick.map((q) => (
                <button key={q.key} type="button" onClick={() => setDay(q.key)} className={opt(day === q.key)}>
                  {q.label}
                </button>
              ))}
              <label className={`${opt(custom)} relative cursor-pointer`}>
                {custom ? dayLabel(day) : "Pick a day"}
                <input
                  type="date"
                  min={today}
                  value={day}
                  onChange={(e) => e.target.value && setDay(e.target.value)}
                  aria-label="Pick a day"
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </div>
            {showTime || time ? (
              <div className="flex items-center gap-2 text-[14px] text-neutral-600">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  aria-label="Time"
                  className="rounded-lg border border-neutral-300 bg-transparent px-2 py-1 text-[14px] text-neutral-900 outline-none"
                />
                {time && <span>{timeLabel(time)}</span>}
                <button type="button" onClick={() => { setTime(""); setShowTime(false); }} className="text-neutral-500 underline underline-offset-2">
                  no time
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowTime(true)} className="text-[14px] text-neutral-500 underline underline-offset-2">
                Add a time
              </button>
            )}
            <p className="text-[13px] text-neutral-500">Posts end after their day.</p>
          </div>
        </div>
      </div>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-neutral-200 bg-linen py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value as Audience)}
          aria-label="Who can see it"
          className="min-w-0 bg-transparent text-[14px] text-neutral-600 outline-none"
        >
          {AUDIENCES.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          {error && <span className="text-[13px] font-medium text-rose-700">{error}</span>}
          <button
            type="button"
            onClick={post}
            disabled={sending}
            className="flex h-9 items-center gap-1.5 rounded-[10px] bg-neutral-900 px-4 text-[15px] font-bold text-white disabled:opacity-60"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            Post
          </button>
        </div>
      </footer>
    </div>
  );
}
