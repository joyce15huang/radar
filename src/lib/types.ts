// Core domain types for the Personal Daily Digest (Pivot V1: "asynchronous social").
// The feed is now polymorphic — one Cards table, many card TYPES, each rendered
// differently. This union is the single source of truth the UI renders against.

export type CategoryKey =
  | "tech"
  | "local"
  | "finance"
  | "schedule"
  | "admin"
  | "world"
  | "health"
  | "culture";

export type CardStatus = "pending" | "dismissed" | "saved" | "accepted";

/**
 * The card taxonomy. Deliberately a small, extensible set — add a new member
 * here plus a branch in DigestCard + CARD_TYPES meta and it flows through.
 */
export type CardType =
  | "social_ping" // low-pressure message/link from a friend
  | "social_invite" // event invite from a friend (RSVP)
  | "news_scout" // AI-curated local gem / discovery item (the "Location" axis)
  | "time_window" // an expiring opportunity with a deadline (the "Time" axis)
  | "calendar_radar" // the user's own upcoming schedule
  | "social_post" // a friend's photo post shared to an event's attendees
  | "event_update"; // a "details updated" heads-up when the host edits an event

interface CardBase {
  id: string;
  status: CardStatus;
  /** ISO timestamp. */
  createdAt: string;
}

export interface SocialPingCard extends CardBase {
  type: "social_ping";
  senderName: string;
  /** The message body. May use lightweight markdown. */
  message: string;
  /** Optional link the friend attached. */
  link?: string;
}

export interface SocialInviteCard extends CardBase {
  type: "social_invite";
  /** Who invited THIS user (the host, or a guest re-inviting when allowed). */
  senderName: string;
  eventTitle: string;
  /** Human-readable time for now (e.g. "Sat, Aug 9 · 7:00 PM"). */
  eventTime: string;
  /** Best-effort ISO timestamp for chronological sorting. */
  startsAt?: string;
  location?: string;
  note?: string;
  /** The shared event this invite belongs to. */
  eventId?: string;
  /** The event's host — the ONLY person who can edit it. */
  hostId?: string;
  hostName?: string;
  /** Preserved original source, when promoted from a discovered public card. */
  sourceUrl?: string;
  summary?: string;
  /** Countdown window carried from a time_window source. */
  expiresAt?: string;
  opensAt?: string;
  category?: CategoryKey;
  /** Host allows guests to invite others. */
  allowReinvite?: boolean;
}

export interface NewsScoutCard extends CardBase {
  type: "news_scout";
  category: CategoryKey;
  title: string;
  /** 2-3 sentence briefing. Supports **bold**, *italic*, `code`. */
  summary: string;
  actionLabel: string;
  actionUrl?: string;
  /** 1-3 word label of what it is ("Stargazing", "Farmers market", …). */
  topic?: string;
}

export interface TimeWindowCard extends CardBase {
  type: "time_window";
  category: CategoryKey;
  title: string;
  /** 2-3 calm sentences explaining the opportunity. */
  summary: string;
  actionLabel: string;
  /** Source URL. Mandatory in practice — it's the accuracy backstop. */
  actionUrl?: string;
  /**
   * ISO timestamp the window CLOSES. Drives the countdown. Must come from the
   * source, never invented — an item without a real deadline is a news_scout,
   * not a time_window.
   */
  expiresAt?: string;
  /** ISO timestamp the window OPENS, when relevant (e.g. permits open). */
  opensAt?: string;
  /** Fallback human label if no machine date (e.g. "This weekend only"). */
  windowLabel?: string;
  /** 1-3 word label of what it is ("Stargazing", "Live music", …). */
  topic?: string;
}

export interface CalendarRadarCard extends CardBase {
  type: "calendar_radar";
  title: string;
  /** Human-readable time (e.g. "Today · 2:30 PM"). */
  time: string;
  /** Best-effort ISO timestamp for chronological sorting. */
  startsAt?: string;
  location?: string;
  details?: string;
}

export interface SocialPostCard extends CardBase {
  type: "social_post";
  senderName: string;
  /** Resolved public image URLs (one or more). */
  imageUrls: string[];
  /** First image, kept for back-compat / previews. */
  imageUrl: string;
  caption?: string;
  /** The event this post was shared to, for context. */
  eventTitle?: string;
}

export interface EventUpdateCard extends CardBase {
  type: "event_update";
  /** Who changed the plan (the host). */
  hostName: string;
  eventTitle: string;
  /** The event's new human time after the edit. */
  eventTime?: string;
  location?: string;
  /** Short note on what changed. */
  changeSummary?: string;
  /** The event this update refers to. */
  eventId?: string;
}

/** The discriminated union the feed renders. */
export type DigestCardData =
  | SocialPingCard
  | SocialInviteCard
  | NewsScoutCard
  | TimeWindowCard
  | CalendarRadarCard
  | SocialPostCard
  | EventUpdateCard;
