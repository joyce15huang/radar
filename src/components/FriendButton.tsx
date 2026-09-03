"use client";

import { useState } from "react";
import { UserPlus, UserCheck, Loader2, Clock, Check, X } from "lucide-react";
import { addFriend, acceptFriend, declineFriend, cancelRequest, unfriend } from "@/app/friends-actions";
import type { FriendStatus, FriendState } from "@/lib/friends";

const base =
  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60";
const solid =
  "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";
const outline =
  "border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";

/**
 * The friend control on someone's profile. Facebook-style: Add friend → Requested
 * (cancelable) → Friends (unfriendable); an incoming request shows Accept / Decline.
 */
export function FriendButton({ targetId, initial }: { targetId: string; initial: FriendState }) {
  const [status, setStatus] = useState<FriendStatus>(initial.status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "self") return null;

  async function run(fn: () => Promise<{ ok: boolean; error?: string; status?: FriendStatus }>, optimistic: FriendStatus) {
    const prev = status;
    setPending(true);
    setError(null);
    setStatus(optimistic);
    const res = await fn();
    setPending(false);
    if (!res.ok) {
      setStatus(prev);
      setError(res.error ?? "Couldn't update.");
      return;
    }
    if (res.status) setStatus(res.status);
  }

  const spinner = <Loader2 className="h-4 w-4 animate-spin" />;

  let control: React.ReactNode;
  if (status === "friends") {
    control = (
      <button
        type="button"
        onClick={() => run(() => unfriend(targetId), "none")}
        disabled={pending}
        className={`${base} ${outline} group`}
      >
        {pending ? spinner : <UserCheck className="h-4 w-4" />}
        <span className="group-hover:hidden">Friends</span>
        <span className="hidden group-hover:inline">Unfriend</span>
      </button>
    );
  } else if (status === "outgoing") {
    control = (
      <button
        type="button"
        onClick={() => run(() => cancelRequest(targetId), "none")}
        disabled={pending}
        className={`${base} ${outline} group`}
      >
        {pending ? spinner : <Clock className="h-4 w-4" />}
        <span className="group-hover:hidden">Requested</span>
        <span className="hidden group-hover:inline">Cancel</span>
      </button>
    );
  } else if (status === "incoming") {
    control = (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => run(() => acceptFriend(targetId), "friends")}
          disabled={pending}
          className={`${base} ${solid}`}
        >
          {pending ? spinner : <Check className="h-4 w-4" />}
          Accept
        </button>
        <button
          type="button"
          onClick={() => run(() => declineFriend(targetId), "none")}
          disabled={pending}
          aria-label="Decline"
          className="rounded-full p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  } else {
    control = (
      <button
        type="button"
        onClick={() => run(() => addFriend(targetId), "outgoing")}
        disabled={pending}
        className={`${base} ${solid}`}
      >
        {pending ? spinner : <UserPlus className="h-4 w-4" />}
        Add friend
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {control}
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
