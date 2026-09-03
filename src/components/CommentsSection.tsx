"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, Loader2, Trash2 } from "lucide-react";
import { listComments, addComment, deleteComment, type EventComment } from "@/app/comment-actions";
import { initials } from "@/lib/cardTypes";

/** Relative time like "just now", "5m", "3h", "2d", else a short date. */
function ago(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 604800) return `${Math.round(s / 86400)}d`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Comments / updates thread for the event page. */
export function CommentsSection({ eventId }: { eventId: string }) {
  const [comments, setComments] = useState<EventComment[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    listComments(eventId)
      .then(setComments)
      .catch(() => setComments([]));
  }, [eventId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !body.trim()) return;
    setSending(true);
    const res = await addComment(eventId, body);
    setSending(false);
    if (res.ok) {
      setBody("");
      reload();
    }
  }

  async function remove(id: string) {
    if (busyId) return;
    setBusyId(id);
    await deleteComment(id);
    setBusyId(null);
    reload();
  }

  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        {comments === null ? (
          <div className="h-12 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
        ) : comments.length === 0 ? (
          <p className="pb-3 text-sm text-neutral-400 dark:text-neutral-500">
            No comments yet — start the thread.
          </p>
        ) : (
          <ul className="space-y-3 pb-3">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[0.6rem] font-semibold text-white dark:bg-white dark:text-neutral-900">
                  {initials(c.authorName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="font-medium text-neutral-700 dark:text-neutral-200">
                      {c.isMine ? "You" : c.authorName}
                    </span>
                    · {ago(c.createdAt)}
                    {c.isMine && (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        disabled={busyId === c.id}
                        aria-label="Delete comment"
                        className="ml-1 text-neutral-300 transition hover:text-rose-500 disabled:opacity-60 dark:text-neutral-600"
                      >
                        {busyId === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-neutral-800 dark:text-neutral-100">
                    {c.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={send} className="flex items-center gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment…"
            className="flex-1 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700"
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            aria-label="Send"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
    </div>
  );
}
