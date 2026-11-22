"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarPlus, MessageCircle, Send } from "lucide-react";
import { toggleSave } from "@/app/open-post-actions";
import type { FeedPost } from "@/lib/openPosts";
import { LinkText } from "@/components/LinkText";

const TONES = ["bg-[#2F7D6D]", "bg-[#7C5CFF]", "bg-[#B07A4F]", "bg-[#D97706]", "bg-[#3B82F6]", "bg-fuchsia-700"];
export function toneOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function Avatar({ id, name, size = 38 }: { id: string; name: string; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold uppercase text-white ${toneOf(id)}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** One post: who, how you know them, the text, its day, and Save · Message · Share. */
export function OpenPostItem({ post, linkBody = true, divider = true }: { post: FeedPost; linkBody?: boolean; divider?: boolean }) {
  const [saved, setSaved] = useState(post.savedByMe);
  const [count, setCount] = useState(post.saves);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function save() {
    if (busy || post.mine) return;
    setBusy(true);
    const next = !saved;
    setSaved(next);
    setCount((n) => n + (next ? 1 : -1));
    const res = await toggleSave(post.id).catch(() => ({ ok: false as const }));
    if (!res.ok) {
      setSaved(!next);
      setCount((n) => n + (next ? -1 : 1));
    }
    setBusy(false);
  }

  async function share() {
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ text: post.body.slice(0, 120), url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* dismissed */
    }
  }

  const body = (
    <>
      <LinkText nested text={post.body} className="mt-1.5 whitespace-pre-line break-words text-[16px] leading-[1.5] text-neutral-900" />
      {post.when && <p className="mt-1.5 text-[14px] text-neutral-500">{post.when}</p>}
    </>
  );

  return (
    <article className={`flex gap-3 py-4 ${divider ? "border-b border-neutral-200/80" : ""}`}>
      <Avatar id={post.authorId} name={post.authorName} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-tight">
          <span className="font-bold text-neutral-900">{post.authorName}</span>
          <span className="text-neutral-500"> · {post.ago}</span>
        </p>
        <p className="text-[12px] text-neutral-500">{post.relation}</p>
        {linkBody ? (
          <Link href={`/p/${post.id}`} className="block">
            {body}
          </Link>
        ) : (
          body
        )}
        {post.plan && (
          <Link
            href={`/event/${post.plan.eventId}`}
            className="mt-2.5 flex items-center gap-3 rounded-[14px] border border-neutral-200 bg-white/70 px-3 py-2.5"
          >
            <span className="flex h-[46px] w-[42px] shrink-0 flex-col items-center justify-center rounded-[10px] bg-neutral-200/70">
              <span className="text-[10px] font-bold tracking-wide text-neutral-600">{post.plan.mon}</span>
              <span className="text-[17px] font-bold leading-none text-neutral-900">{post.plan.day}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-neutral-900">{post.plan.title}</span>
              <span className="block truncate text-[13px] text-neutral-500">{post.plan.sub}</span>
            </span>
          </Link>
        )}
        <div className="mt-2 flex items-center gap-5 text-neutral-500">
          <button
            type="button"
            onClick={save}
            disabled={post.mine}
            aria-pressed={saved}
            aria-label={post.mine ? `${count} saved` : saved ? "Saved as a maybe — tap to undo" : "Save as a maybe on your calendar"}
            className={`-ml-1.5 flex h-9 items-center gap-1 rounded-full px-1.5 ${saved ? "text-fuchsia-800" : ""} disabled:opacity-100`}
          >
            {saved ? <CalendarCheck className="h-5 w-5" strokeWidth={2} /> : <CalendarPlus className="h-5 w-5" strokeWidth={1.8} />}
            {count > 0 && <span className="text-[13px] tabular-nums">{count}</span>}
          </button>
          {!post.mine && (
            <Link href={`/p/${post.id}#message`} aria-label={`Message ${post.authorName}`} className="flex h-9 items-center px-1">
              <MessageCircle className="h-5 w-5" strokeWidth={1.8} />
            </Link>
          )}
          <button type="button" onClick={share} aria-label="Share" className="flex h-9 items-center gap-1.5 px-1">
            <Send className="h-[19px] w-[19px]" strokeWidth={1.8} />
            {copied && <span className="text-[12px]">Link copied</span>}
          </button>
        </div>
      </div>
    </article>
  );
}
