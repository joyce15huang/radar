"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { getPrivateWith, sendPrivateNote } from "@/app/comment-actions";
import type { ChatMessage } from "@/lib/chat";

/**
 * The private note that came with an invite, right on the Today card, with a
 * reply box. Just the two of you; it stays with the plan.
 */
export function InviteNoteThread({ eventId, otherId, otherName }: { eventId: string; otherId: string; otherName: string }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // The Today card is draggable (framer-motion listens natively on it), so stop
  // presses inside the thread at the DOM level before they start a swipe.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("pointerdown", stop);
    return () => el.removeEventListener("pointerdown", stop);
  });

  const load = useCallback(() => {
    getPrivateWith(eventId, otherId)
      .then((r) => {
        setMessages(r.messages);
        setClosed(r.closed);
      })
      .catch(() => setMessages([]));
  }, [eventId, otherId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!messages || messages.length === 0) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setError(null);
    const res = await sendPrivateNote(eventId, otherId, body);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't send.");
    setBody("");
    load();
  }

  return (
    <div ref={box} className="select-text space-y-2">
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.isMine ? "justify-end" : ""}`}>
          <span
            className={`max-w-[85%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-[14px] leading-snug ${
              m.isMine
                ? "rounded-[16px_16px_6px_16px] bg-neutral-900 text-white"
                : "rounded-[16px_16px_16px_6px] bg-fuchsia-100 text-neutral-900"
            }`}
          >
            {m.body}
          </span>
        </div>
      ))}
      {!closed && (
        <form onSubmit={send} className="flex h-11 items-center gap-2 rounded-full bg-neutral-200/70 pl-3.5 pr-1">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Reply to ${otherName}`}
            aria-label={`Reply to ${otherName}`}
            maxLength={2000}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400"
          />
          <button
            type="submit"
            disabled={busy || !body.trim()}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.6} />}
          </button>
        </form>
      )}
      {error && <p className="text-[12px] font-medium text-rose-700">{error}</p>}
      <p className="text-[12px] text-neutral-500">Just you and {otherName} · stays with this plan</p>
    </div>
  );
}
