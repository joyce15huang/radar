"use client";

import { useState } from "react";
import Link from "next/link";
import {
  UserPlus,
  Loader2,
  Check,
  X,
  Clock,
  Users,
  UserMinus,
  Undo2,
  AtSign,
} from "lucide-react";
import {
  sendFriendRequest,
  respondToRequest,
  cancelRequest,
  removeFriend,
} from "@/app/friends-actions";
import type { FriendEntry, FriendActionResult } from "@/lib/friends";
import { normalizeUsername } from "@/lib/username";

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

/** Initials for an avatar chip, e.g. "joyce15huang" → "JO". */
function initials(text: string): string {
  const parts = text.split(/[\s._-]+/).filter(Boolean);
  const from = parts.length > 1 ? parts.slice(0, 2).map((p) => p[0]) : [text[0], text[1]];
  return (from.join("") || "?").toUpperCase();
}

function Avatar({ label }: { label: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
      {initials(label)}
    </span>
  );
}

export function FriendsClient({
  friends: initFriends,
  incoming: initIncoming,
  outgoing: initOutgoing,
}: {
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
}) {
  const [friends, setFriends] = useState(initFriends);
  const [incoming, setIncoming] = useState(initIncoming);
  const [outgoing, setOutgoing] = useState(initOutgoing);

  const [handle, setHandle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const raw = handle.trim();
    if (!raw) {
      setError("Enter a username.");
      return;
    }
    const uname = normalizeUsername(raw);
    setPending(true);
    setError(null);
    setNotice(null);
    let res: FriendActionResult;
    try {
      res = await sendFriendRequest(raw);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't send the request.");
      return;
    }
    setHandle("");
    if (res.autoAccepted) {
      setNotice(`You're now friends with @${uname} — they'd already sent you a request.`);
    } else {
      setNotice(`Request sent to @${uname}.`);
      if (!outgoing.some((o) => o.username.toLowerCase() === uname.toLowerCase())) {
        setOutgoing((prev) => [
          { friendshipId: `pending-${uname}`, userId: "", username: uname, email: "", name: uname },
          ...prev,
        ]);
      }
    }
  }

  async function onRespond(entry: FriendEntry, accept: boolean) {
    setBusyId(entry.friendshipId);
    setError(null);
    const res = await respondToRequest(entry.friendshipId, accept);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error ?? "Couldn't update the request.");
      return;
    }
    setIncoming((prev) => prev.filter((e) => e.friendshipId !== entry.friendshipId));
    if (accept) setFriends((prev) => [entry, ...prev]);
  }

  async function onCancel(entry: FriendEntry) {
    setBusyId(entry.friendshipId);
    setError(null);
    const res = await cancelRequest(entry.friendshipId);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error ?? "Couldn't cancel the request.");
      return;
    }
    setOutgoing((prev) => prev.filter((e) => e.friendshipId !== entry.friendshipId));
  }

  async function onRemove(entry: FriendEntry) {
    setBusyId(entry.friendshipId);
    setError(null);
    const res = await removeFriend(entry.friendshipId);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error ?? "Couldn't remove.");
      return;
    }
    setFriends((prev) => prev.filter((e) => e.friendshipId !== entry.friendshipId));
  }

  return (
    <div className="space-y-6">
      {/* Add by username */}
      <form onSubmit={onAdd} className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <AtSign
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
              strokeWidth={2}
            />
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Add
          </button>
        </div>
        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}
      </form>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <Section title="Requests" count={incoming.length}>
          {incoming.map((e) => (
            <Row key={e.friendshipId} entry={e}>
              <button
                type="button"
                onClick={() => onRespond(e, true)}
                disabled={busyId === e.friendshipId}
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {busyId === e.friendshipId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Accept
              </button>
              <button
                type="button"
                onClick={() => onRespond(e, false)}
                disabled={busyId === e.friendshipId}
                aria-label="Decline"
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <X className="h-3.5 w-3.5" />
                Decline
              </button>
            </Row>
          ))}
        </Section>
      )}

      {/* Accepted friends */}
      <Section title="Friends" count={friends.length}>
        {friends.length === 0 ? (
          <EmptyRow
            icon={<Users className="h-6 w-6" strokeWidth={2} />}
            text="No friends yet. Add someone by their username above."
          />
        ) : (
          friends.map((e) => (
            <Row key={e.friendshipId} entry={e} href={e.userId ? `/u/${e.userId}` : undefined}>
              <button
                type="button"
                onClick={() => onRemove(e)}
                disabled={busyId === e.friendshipId}
                aria-label="Remove friend"
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
              >
                {busyId === e.friendshipId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserMinus className="h-3.5 w-3.5" />
                )}
                Remove
              </button>
            </Row>
          ))
        )}
      </Section>

      {/* Outgoing pending */}
      {outgoing.length > 0 && (
        <Section title="Sent" count={outgoing.length}>
          {outgoing.map((e) => (
            <Row key={e.friendshipId} entry={e}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                <Clock className="h-3.5 w-3.5" />
                Pending
              </span>
              {e.friendshipId.startsWith("pending-") ? null : (
                <button
                  type="button"
                  onClick={() => onCancel(e)}
                  disabled={busyId === e.friendshipId}
                  aria-label="Cancel request"
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                >
                  {busyId === e.friendshipId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Undo2 className="h-3.5 w-3.5" />
                  )}
                  Cancel
                </button>
              )}
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {title}
        <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {count}
        </span>
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({
  entry,
  href,
  children,
}: {
  entry: FriendEntry;
  href?: string;
  children: React.ReactNode;
}) {
  const label = entry.username || entry.name;
  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar label={label} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {entry.username ? `@${entry.username}` : entry.name}
        </p>
        {entry.email && (
          <p className="truncate text-xs text-neutral-400 dark:text-neutral-500">{entry.email}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-neutral-200/80 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {href ? (
        <Link href={href} className="min-w-0 flex-1 rounded-xl transition hover:opacity-80">
          {identity}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{identity}</div>
      )}
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

function EmptyRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-200 bg-white/50 px-4 py-8 text-center dark:border-neutral-800 dark:bg-neutral-900/40">
      <span className="text-neutral-300 dark:text-neutral-600">{icon}</span>
      <p className="text-sm text-neutral-400 dark:text-neutral-500">{text}</p>
    </div>
  );
}
