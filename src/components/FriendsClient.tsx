"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, UserMinus, AtSign, Users, Check, X } from "lucide-react";
import { addFriend, unfriend, acceptFriend, declineFriend } from "@/app/friends-actions";
import type { FriendEntry, FriendRequestEntry } from "@/lib/friends";

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

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

/** The Friends subtab: add by username, incoming requests, then your friends. */
export function FriendsClient({
  friends,
  requests,
}: {
  friends: FriendEntry[];
  requests: FriendRequestEntry[];
}) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const raw = handle.trim();
    if (!raw) return setError("Enter a username.");
    setPending(true);
    setError(null);
    setNotice(null);
    const res = await addFriend(raw);
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Couldn't send the request.");
    setHandle("");
    setNotice(res.status === "friends" ? "You're now friends." : "Friend request sent.");
    router.refresh();
  }

  async function act(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyId(id);
    setError(null);
    const res = await fn();
    setBusyId(null);
    if (!res.ok) return setError(res.error ?? "Something went wrong.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onAdd} className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" strokeWidth={2} />
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="username to add"
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

      {requests.length > 0 && (
        <section>
          <SectionTitle>Requests</SectionTitle>
          <div className="space-y-2">
            {requests.map((e) => (
              <Row key={e.id} entry={e}>
                <button
                  type="button"
                  onClick={() => act(e.id, () => acceptFriend(e.id))}
                  disabled={busyId === e.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  {busyId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => act(e.id, () => declineFriend(e.id))}
                  disabled={busyId === e.id}
                  aria-label="Decline"
                  className="rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-60 dark:hover:bg-neutral-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </Row>
            ))}
          </div>
        </section>
      )}

      <section>
        {requests.length > 0 && <SectionTitle>Friends</SectionTitle>}
        <div className="space-y-2">
          {friends.length === 0 ? (
            <EmptyRow text="No friends yet. Add someone by their username above." />
          ) : (
            friends.map((e) => (
              <Row key={e.id} entry={e}>
                <button
                  type="button"
                  onClick={() => act(e.id, () => unfriend(e.id))}
                  disabled={busyId === e.id}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                >
                  {busyId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                  Unfriend
                </button>
              </Row>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
      {children}
    </h2>
  );
}

function Row({ entry, children }: { entry: FriendEntry | FriendRequestEntry; children: React.ReactNode }) {
  const label = entry.username || entry.name;
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-neutral-200/70 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <Link href={`/u/${entry.id}`} className="min-w-0 flex-1 rounded-xl transition hover:opacity-80">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar label={label} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {entry.username ? `@${entry.username}` : entry.name}
            </p>
            {entry.email && <p className="truncate text-xs text-neutral-400 dark:text-neutral-500">{entry.email}</p>}
          </div>
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-200 bg-white/50 px-4 py-8 text-center dark:border-neutral-800 dark:bg-neutral-900/40">
      <span className="text-neutral-300 dark:text-neutral-600">
        <Users className="h-6 w-6" strokeWidth={2} />
      </span>
      <p className="text-sm text-neutral-400 dark:text-neutral-500">{text}</p>
    </div>
  );
}
