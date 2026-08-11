"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Loader2, Check, Users } from "lucide-react";
import { inviteToEvent } from "@/app/event-actions";
import { listMyAcceptedFriends } from "@/app/friends-actions";
import { FriendPicker } from "@/components/FriendPicker";
import type { FriendOption } from "@/lib/friends";

type Target =
  | { kind: "source"; cardId: string }
  | { kind: "event"; eventId: string };

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

export function InviteComposer({
  eventTitle,
  target,
  canSetReinvite,
  initialAllowReinvite = false,
  onClose,
}: {
  eventTitle: string;
  target: Target;
  canSetReinvite: boolean;
  initialAllowReinvite?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [selected, setSelected] = useState<FriendOption[]>([]);
  const [note, setNote] = useState("");
  const [allowReinvite, setAllowReinvite] = useState(initialAllowReinvite);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; notFound: string[] } | null>(null);

  // Load the friend pool for the autocomplete once, on open.
  useEffect(() => {
    let active = true;
    listMyAcceptedFriends()
      .then((list) => {
        if (active) setFriends(list);
      })
      .catch(() => {
        /* leave the pool empty; the picker shows an "add friends first" hint */
      });
    return () => {
      active = false;
    };
  }, []);

  async function send() {
    // Invite by @username; inviteToEvent resolves usernames (and emails) server-side.
    const list = selected.map((f) => f.username).filter(Boolean);
    if (list.length === 0) {
      setError("Pick at least one friend to invite.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await inviteToEvent({
      ...(target.kind === "source" ? { sourceCardId: target.cardId } : { eventId: target.eventId }),
      recipients: list,
      ...(canSetReinvite ? { allowReinvite } : {}),
      note: note.trim() || undefined,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't send the invite.");
      return;
    }
    setResult({ sent: res.sent ?? 0, notFound: res.notFound ?? [] });
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-neutral-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Invite friends</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          to <span className="font-medium text-neutral-700 dark:text-neutral-200">{eventTitle}</span>
        </p>

        {result ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Check className="h-7 w-7" strokeWidth={2.5} />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {result.sent > 0 ? "Invite sent" : "No new invites"}
            </h3>
            <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
              {result.sent > 0
                ? `It's on top of ${result.sent} friend${result.sent === 1 ? "'s" : "s'"} Today deck.`
                : "Everyone you listed is already on the guest list."}
              {result.notFound.length > 0 && ` Not on the app yet: ${result.notFound.join(", ")}.`}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <FriendPicker friends={friends} selected={selected} onChange={setSelected} />

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Add a note (optional)
              </span>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="let's carpool up together!"
                className={`${inputCls} resize-y`}
              />
            </label>

            {canSetReinvite && (
              <label className="flex items-start gap-2.5 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                <input
                  type="checkbox"
                  checked={allowReinvite}
                  onChange={(e) => setAllowReinvite(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400 dark:border-neutral-600"
                />
                <span className="text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-neutral-800 dark:text-neutral-100">
                    <Users className="h-3.5 w-3.5" /> Let guests invite others
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                    You stay the only one who can edit the details.
                  </span>
                </span>
              </label>
            )}

            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

            <button
              type="button"
              onClick={send}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Send invite
                </>
              )}
            </button>
            <p className="text-center text-xs text-neutral-400 dark:text-neutral-600">
              No notification — it appears on top of their Today deck.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
