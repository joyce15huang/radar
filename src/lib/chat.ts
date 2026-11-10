// Shared shapes + rules for plan chat (see app/comment-actions.ts, migration 0044).

/** The chat goes read-only this long after the plan ends (or starts, if no end). */
export const CHAT_OPEN_AFTER_MS = 48 * 3_600_000;

export const NEEDS_0044 = "Run migration 0044_chat in Supabase to turn on announcements and private notes.";

/** When a plan's chat closes, or null if it never does (no date). */
export function chatClosesAt(startsAt: string | null | undefined, endsAt?: string | null): string | null {
  const end = Date.parse(endsAt ?? "");
  const start = Date.parse(startsAt ?? "");
  const base = !Number.isNaN(end) ? end : !Number.isNaN(start) ? start : NaN;
  if (Number.isNaN(base)) return null;
  return new Date(base + CHAT_OPEN_AFTER_MS).toISOString();
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
}

export interface PrivateThread {
  otherId: string;
  otherName: string;
  messages: ChatMessage[];
}

export interface ChatView {
  /** The shared thread, oldest first. */
  messages: ChatMessage[];
  /** Host / captain announcements, newest first. */
  announcements: ChatMessage[];
  /** Your private threads on this plan (one per person). */
  privateThreads: PrivateThread[];
  closesAt: string | null;
  closed: boolean;
  canAnnounce: boolean;
}
