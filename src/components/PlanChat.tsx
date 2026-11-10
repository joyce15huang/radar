"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUp, Loader2, Lock, Megaphone, Trash2 } from "lucide-react";
import { getChat, postChat, sendPrivateNote, deleteComment } from "@/app/comment-actions";
import type { ChatMessage, ChatView, PrivateThread } from "@/lib/chat";
import { initials } from "@/lib/cardTypes";

const card = "rounded-[18px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]";

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function closesLabel(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined });
  return `${day} ${time}`;
}

/**
 * The plan's chat: pinned announcements, the shared thread, and any private
 * notes you have with one person. It closes 48h after the plan and stays
 * readable (folded) in the recap. No notifications — only announcements reach Today.
 */
export function PlanChat({ eventId }: { eventId: string }) {
  const [view, setView] = useState<ChatView | null | "loading">("loading");
  const reload = useCallback(() => {
    getChat(eventId)
      .then(setView)
      .catch(() => setView(null));
  }, [eventId]);
  useEffect(() => {
    reload();
  }, [reload]);

  if (view === "loading") return <div className={`${card} h-24 animate-pulse`} />;
  if (!view) return null;

  return (
    <section id="chat" className="scroll-mt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">Chat</h2>
        {view.closed ? (
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 text-[12px] font-bold text-neutral-600">
            <Lock className="h-3 w-3" strokeWidth={2.4} /> Closed
          </span>
        ) : view.closesAt ? (
          <span className="text-[13px] font-medium text-neutral-500">Closes {closesLabel(view.closesAt)}</span>
        ) : null}
      </div>

      {view.announcements.length > 0 && <Announcements items={view.announcements} />}

      {view.closed ? <ClosedThread messages={view.messages} /> : <OpenThread eventId={eventId} view={view} onChange={reload} />}

      {view.privateThreads.map((t) => (
        <PrivateBox key={t.otherId} eventId={eventId} thread={t} closed={view.closed} onChange={reload} />
      ))}
    </section>
  );
}

function Announcements({ items }: { items: ChatMessage[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 1);
  return (
    <div className="space-y-2">
      {shown.map((a) => (
        <div key={a.id} className="flex items-start gap-2.5 rounded-[14px] bg-fuchsia-100 px-3.5 py-3">
          <Megaphone className="mt-0.5 h-[17px] w-[17px] shrink-0 text-fuchsia-800" strokeWidth={2.2} />
          <span className="min-w-0">
            <span className="block text-[12px] font-bold uppercase tracking-wide text-fuchsia-800">
              Announcement · {a.isMine ? "You" : a.authorName} · {ago(a.createdAt)}
            </span>
            <span className="block whitespace-pre-wrap break-words text-[14px] font-semibold leading-snug text-neutral-900">
              {a.body}
            </span>
          </span>
        </div>
      ))}
      {items.length > 1 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-[13px] font-semibold text-fuchsia-800">
          {all ? "Show latest only" : `${items.length - 1} earlier`}
        </button>
      )}
    </div>
  );
}

function Bubbles({ messages, onDelete }: { messages: ChatMessage[]; onDelete?: (id: string) => void }) {
  return (
    <ul className="space-y-2.5">
      {messages.map((m, i) => {
        const showName = !m.isMine && messages[i - 1]?.authorId !== m.authorId;
        return (
          <li key={m.id} className={`group flex items-end gap-2 ${m.isMine ? "justify-end" : ""}`}>
            {!m.isMine && (
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-800 ${showName ? "" : "invisible"}`}
                aria-hidden
              >
                {initials(m.authorName)}
              </span>
            )}
            {m.isMine && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(m.id)}
                aria-label="Delete message"
                className="mb-2 text-neutral-300 opacity-0 transition hover:text-rose-600 focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <span
              className={`max-w-[78%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-[14px] leading-snug ${
                m.isMine
                  ? "rounded-[16px_16px_6px_16px] bg-fuchsia-700 text-white"
                  : "rounded-[16px_16px_16px_6px] bg-white text-neutral-900 shadow-[0_2px_8px_rgba(80,50,35,0.06)]"
              }`}
            >
              {showName && <span className="mb-0.5 block text-[11px] font-bold text-neutral-500">{m.authorName}</span>}
              {m.body}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Composer({
  placeholder,
  onSend,
  canAnnounce = false,
}: {
  placeholder: string;
  onSend: (body: string, announce: boolean) => Promise<string | null>;
  canAnnounce?: boolean;
}) {
  const [body, setBody] = useState("");
  const [announce, setAnnounce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setError(null);
    const err = await onSend(body, announce);
    setBusy(false);
    if (err) return setError(err);
    setBody("");
    setAnnounce(false);
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      {canAnnounce && (
        <div role="group" aria-label="Send as" className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1">
          {([false, true] as const).map((a) => (
            <button
              key={String(a)}
              type="button"
              aria-pressed={announce === a}
              onClick={() => setAnnounce(a)}
              className={`h-9 rounded-lg text-[13px] font-semibold transition ${
                announce === a ? (a ? "bg-white text-fuchsia-800 shadow-sm" : "bg-white text-neutral-900 shadow-sm") : "text-neutral-600"
              }`}
            >
              {a ? "Announce · on everyone’s Today" : "Chat"}
            </button>
          ))}
        </div>
      )}
      <div className="flex h-12 items-center gap-2 rounded-full bg-neutral-200/70 pl-4 pr-1.5">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={announce ? "Announce to everyone" : placeholder}
          aria-label={placeholder}
          maxLength={2000}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400"
        />
        <button
          type="submit"
          disabled={busy || !body.trim()}
          aria-label="Send"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40 ${
            announce ? "bg-fuchsia-700" : "bg-neutral-900"
          }`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.6} />}
        </button>
      </div>
      {error && <p className="text-[13px] font-medium text-rose-700">{error}</p>}
    </form>
  );
}

function OpenThread({ eventId, view, onChange }: { eventId: string; view: ChatView; onChange: () => void }) {
  async function remove(id: string) {
    await deleteComment(id);
    onChange();
  }
  return (
    <div className={`${card} space-y-3 p-4`}>
      {view.messages.length === 0 ? (
        <p className="text-[14px] text-neutral-500">Sort out rides, gear and who&rsquo;s bringing what here.</p>
      ) : (
        <Bubbles messages={view.messages} onDelete={remove} />
      )}
      <Composer
        placeholder="Message the plan"
        canAnnounce={view.canAnnounce}
        onSend={async (body, announce) => {
          const res = await postChat(eventId, body, { announce });
          if (!res.ok) return res.error ?? "Couldn't send.";
          onChange();
          return null;
        }}
      />
      <p className="text-center text-[12px] text-neutral-500">No notifications — it&rsquo;s here when you open the plan.</p>
    </div>
  );
}

function ClosedThread({ messages }: { messages: ChatMessage[] }) {
  const [open, setOpen] = useState(false);
  if (messages.length === 0) return null;
  return (
    <div className={`${card} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-[15px] font-semibold text-neutral-900">{open ? "Hide the chat" : "Read the whole chat"}</span>
          <span className="block text-[13px] text-neutral-500">
            {messages.length} {messages.length === 1 ? "message" : "messages"} · read-only
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-neutral-100 bg-linen/60 p-4">
          <Bubbles messages={messages} />
        </div>
      )}
    </div>
  );
}

function PrivateBox({
  eventId,
  thread,
  closed,
  onChange,
}: {
  eventId: string;
  thread: PrivateThread;
  closed: boolean;
  onChange: () => void;
}) {
  return (
    <div className={`${card} space-y-3 p-4`}>
      <p className="text-[12px] font-bold uppercase tracking-wide text-neutral-500">Just you and {thread.otherName}</p>
      <Bubbles messages={thread.messages} />
      {!closed && (
        <Composer
          placeholder={`Reply to ${thread.otherName}`}
          onSend={async (body) => {
            const res = await sendPrivateNote(eventId, thread.otherId, body);
            if (!res.ok) return res.error ?? "Couldn't send.";
            onChange();
            return null;
          }}
        />
      )}
    </div>
  );
}
