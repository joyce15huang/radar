"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { sendPostMessage, convertToPlan, deleteOpenPost } from "@/app/open-post-actions";

/** A private back-and-forth with one person about a post. */
export function PostThreadBox({
  postId,
  toId,
  title,
  hint,
  messages,
  open = true,
}: {
  postId: string;
  toId?: string;
  title: string;
  hint?: string;
  messages: { mine: boolean; body: string; at: string }[];
  open?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await sendPostMessage(postId, text, toId);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't send.");
    setText("");
    router.refresh();
  }

  return (
    <div className="py-3">
      <p className="text-[14px] font-bold text-neutral-900">{title}</p>
      {hint && <p className="text-[12px] text-neutral-500">{hint}</p>}
      {messages.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {messages.map((m, i) => (
            <li key={i} className={`flex ${m.mine ? "justify-end" : ""}`}>
              <span
                className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3 py-1.5 text-[15px] leading-snug ${
                  m.mine ? "bg-neutral-900 text-white" : "bg-white text-neutral-900"
                }`}
              >
                {m.body}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-2 flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            maxLength={1000}
            placeholder="Write a message…"
            aria-label={title}
            className="min-h-[40px] flex-1 resize-none rounded-[12px] border border-neutral-300 bg-white/60 px-3 py-2 text-[15px] outline-none placeholder:text-neutral-400"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !text.trim()}
            className="flex h-10 items-center rounded-[10px] bg-neutral-900 px-3.5 text-[14px] font-bold text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-[13px] font-medium text-rose-700">{error}</p>}
    </div>
  );
}

/** Poster: make the post a real plan (invites everyone who saved it). */
export function ConvertPanel({ postId, savers }: { postId: string; savers: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    const res = await convertToPlan(postId);
    setBusy(false);
    if (!res.ok || !res.id) return setError(res.error ?? "Couldn't make the plan.");
    router.push(`/event/${res.id}`);
  }
  return (
    <div className="border-t border-neutral-200 py-4">
      <p className="text-[15px] font-bold text-neutral-900">Turn it into a plan</p>
      <p className="mt-0.5 text-[14px] leading-snug text-neutral-600">
        Puts it on your calendar{savers > 0 ? `, invites the ${savers} who saved it,` : ""} and opens a chat for the logistics. Your post links to it.
      </p>
      <div className="mt-3 flex items-center justify-end gap-3">
        {error && <span className="text-[13px] font-medium text-rose-700">{error}</span>}
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className="flex h-9 items-center gap-1.5 rounded-[10px] bg-neutral-900 px-4 text-[14px] font-bold text-white disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Make plan
        </button>
      </div>
    </div>
  );
}

export function DeletePost({ postId }: { postId: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (!sure) return setSure(true);
        const res = await deleteOpenPost(postId);
        if (res.ok) {
          router.push("/today");
          router.refresh();
        }
      }}
      className="text-[13px] text-neutral-500 underline underline-offset-2"
    >
      {sure ? "Tap again to delete" : "Delete post"}
    </button>
  );
}
