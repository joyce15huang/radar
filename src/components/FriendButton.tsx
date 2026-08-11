"use client";

import { useState } from "react";
import { UserPlus, Check, Clock, Loader2, UserMinus, X } from "lucide-react";
import {
  sendFriendRequest,
  respondToRequest,
  cancelRequest,
  removeFriend,
} from "@/app/friends-actions";
import type { FriendshipState } from "@/lib/friends";

/**
 * The friend control on someone's public profile. Seeded with the server-computed
 * relationship, then updates locally as the viewer acts. Full request management
 * (with cancel of a freshly-sent request) lives on the Friends page; here the
 * profile just needs to reflect state and offer the primary action.
 */
export function FriendButton({
  targetUsername,
  initial,
}: {
  targetUsername: string;
  initial: FriendshipState;
}) {
  const [state, setState] = useState<FriendshipState>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === "self") return null;

  const base =
    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60";
  const solid =
    "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";
  const outline =
    "border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";

  async function add() {
    setPending(true);
    setError(null);
    const res = await sendFriendRequest(targetUsername);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't send the request.");
      return;
    }
    // A reverse request may have existed → we could now be friends.
    setState({ status: res.autoAccepted ? "friends" : "outgoing", friendshipId: state.friendshipId });
  }

  async function accept() {
    if (!state.friendshipId) return;
    setPending(true);
    setError(null);
    const res = await respondToRequest(state.friendshipId, true);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't accept.");
      return;
    }
    setState({ status: "friends", friendshipId: state.friendshipId });
  }

  async function decline() {
    if (!state.friendshipId) return;
    setPending(true);
    setError(null);
    const res = await respondToRequest(state.friendshipId, false);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't decline.");
      return;
    }
    setState({ status: "none" });
  }

  async function cancel() {
    if (!state.friendshipId) return;
    setPending(true);
    setError(null);
    const res = await cancelRequest(state.friendshipId);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't cancel.");
      return;
    }
    setState({ status: "none" });
  }

  async function remove() {
    if (!state.friendshipId) return;
    setPending(true);
    setError(null);
    const res = await removeFriend(state.friendshipId);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't remove.");
      return;
    }
    setState({ status: "none" });
  }

  const spinner = <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2">
        {state.status === "none" && (
          <button type="button" onClick={add} disabled={pending} className={`${base} ${solid}`}>
            {pending ? spinner : <UserPlus className="h-4 w-4" />}
            Add friend
          </button>
        )}

        {state.status === "incoming" && (
          <>
            <button type="button" onClick={accept} disabled={pending} className={`${base} ${solid}`}>
              {pending ? spinner : <Check className="h-4 w-4" />}
              Accept request
            </button>
            <button
              type="button"
              onClick={decline}
              disabled={pending}
              aria-label="Decline"
              className={`${base} ${outline}`}
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}

        {state.status === "outgoing" && (
          <>
            <span
              className={`${base} bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400`}
            >
              <Clock className="h-4 w-4" />
              Requested
            </span>
            {state.friendshipId && (
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className={`${base} ${outline}`}
              >
                {pending ? spinner : "Cancel"}
              </button>
            )}
          </>
        )}

        {state.status === "friends" && (
          <div className="group inline-flex items-center">
            <span
              className={`${base} bg-emerald-50 text-emerald-600 group-hover:hidden dark:bg-emerald-500/10 dark:text-emerald-400`}
            >
              <Check className="h-4 w-4" />
              Friends
            </span>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className={`${base} ${outline} hidden group-hover:inline-flex`}
            >
              {pending ? spinner : <UserMinus className="h-4 w-4" />}
              Remove
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
