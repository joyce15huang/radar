// Shared types for the FRIENDS graph — Facebook-style, mutual, request/accept.
// (The one-way Follow graph is parked for the public-accounts roadmap.)

/** A pickable person for a recipient picker — one of your friends. */
export interface FriendOption {
  id: string;
  username: string;
  /** Used under the hood to address a card; resolved server-side. */
  email: string;
}

/** A row in a Friends list. */
export interface FriendEntry {
  /** The other person's profile id. */
  id: string;
  username: string;
  email: string;
  /** Display name (username, else email local-part). */
  name: string;
}

/** An incoming friend request (someone who wants to be your friend). */
export interface FriendRequestEntry {
  /** The requester's profile id. */
  id: string;
  username: string;
  email: string;
  name: string;
}

/** The viewer's friendship status toward another profile. */
export type FriendStatus =
  | "self"
  | "none"
  | "outgoing" // you sent a request, awaiting them
  | "incoming" // they sent you a request, awaiting you
  | "friends";

export interface FriendState {
  status: FriendStatus;
}

/** Result shape returned by every friend action. */
export interface FriendResult {
  ok: boolean;
  error?: string;
  /** True when the handle didn't resolve to a registered profile. */
  notFound?: boolean;
  /** The status the viewer is now in toward the target (for optimistic UI). */
  status?: FriendStatus;
}
