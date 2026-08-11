// Shared types for the 2-way friendship feature. Kept tiny and UI-facing so
// both the Friends page and the profile FriendButton render against one shape.

/**
 * The viewer's relationship to another user.
 * - `none`     — no relationship (or a previously declined one, treated as none)
 * - `friends`  — accepted friendship
 * - `outgoing` — the viewer sent a request that's still pending
 * - `incoming` — the other user sent the viewer a request that's still pending
 * - `self`     — the other user IS the viewer
 */
export type FriendshipStatus = "none" | "friends" | "outgoing" | "incoming" | "self";

export interface FriendshipState {
  status: FriendshipStatus;
  /** The friendships row id, present for every status except `none` and `self`. */
  friendshipId?: string;
}

/** A resolved friend or pending-request entry for list rendering. */
export interface FriendEntry {
  friendshipId: string;
  /** The other user's auth id. */
  userId: string;
  /** The other user's @handle. May be empty for an optimistic/legacy entry. */
  username: string;
  email: string;
  /** Display name derived from the username (or email local-part as fallback). */
  name: string;
}

/** A pickable accepted-friend for the invite autocomplete. */
export interface FriendOption {
  /** The friend's user id. */
  id: string;
  username: string;
  /** Used under the hood to address the invite (resolved server-side). */
  email: string;
}

/** Result shape returned by every friend action. */
export interface FriendActionResult {
  ok: boolean;
  error?: string;
  /** True when a send immediately became a friendship (a reverse request existed). */
  autoAccepted?: boolean;
  /** True when the target email isn't a registered user yet. */
  notFound?: boolean;
}
