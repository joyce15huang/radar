import type { DigestCardData, CategoryKey, CardStatus } from "./types";
import { publicImageUrl } from "./storage";

/** Shape of a `cards` row as selected by the feed. */
export interface CardRow {
  id: string;
  type: string;
  title: string | null;
  content: Record<string, string | null> | null;
  status: string;
  created_at: string;
  sender_id: string | null;
  event_id: string | null;
}

/**
 * Maps a polymorphic DB row into the typed union the UI renders. Returns null
 * for an unknown type so a bad row is skipped rather than crashing the feed.
 */
export function rowToCard(row: CardRow): DigestCardData | null {
  const base = {
    id: row.id,
    status: (row.status as CardStatus) ?? "pending",
    createdAt: row.created_at,
  };
  const c = row.content ?? {};

  switch (row.type) {
    case "news_scout":
      return {
        ...base,
        type: "news_scout",
        category: (c.category as CategoryKey) ?? "world",
        title: row.title ?? "",
        summary: c.summary ?? "",
        actionLabel: c.actionLabel ?? "Read more",
        actionUrl: c.actionUrl ?? undefined,
      };

    case "time_window":
      return {
        ...base,
        type: "time_window",
        category: (c.category as CategoryKey) ?? "local",
        title: row.title ?? "",
        summary: c.summary ?? "",
        actionLabel: c.actionLabel ?? "Open",
        actionUrl: c.actionUrl ?? undefined,
        expiresAt: c.expiresAt ?? undefined,
        opensAt: c.opensAt ?? undefined,
        windowLabel: c.windowLabel ?? undefined,
      };

    case "social_ping":
      return {
        ...base,
        type: "social_ping",
        senderName: c.senderName ?? "A friend",
        message: c.message ?? row.title ?? "",
        link: c.link ?? undefined,
      };

    case "social_invite":
      return {
        ...base,
        type: "social_invite",
        senderName: c.senderName ?? "A friend",
        eventTitle: row.title ?? c.eventTitle ?? "Invitation",
        eventTime: c.eventTime ?? "",
        startsAt: c.startsAt ?? undefined,
        location: c.location ?? undefined,
        note: c.note ?? undefined,
        eventId: row.event_id ?? undefined,
        hostId: c.hostId ?? undefined,
        hostName: c.hostName ?? undefined,
        sourceUrl: c.sourceUrl ?? undefined,
        summary: c.summary ?? undefined,
        expiresAt: c.expiresAt ?? undefined,
        opensAt: c.opensAt ?? undefined,
        category: (c.category as CategoryKey) ?? undefined,
        allowReinvite: c.allowReinvite === "true",
      };

    case "calendar_radar":
      return {
        ...base,
        type: "calendar_radar",
        title: row.title ?? "",
        time: c.time ?? "",
        startsAt: c.startsAt ?? undefined,
        location: c.location ?? undefined,
        details: c.details ?? undefined,
      };

    case "event_update":
      return {
        ...base,
        type: "event_update",
        hostName: c.hostName ?? "The host",
        eventTitle: row.title ?? c.eventTitle ?? "an event",
        eventTime: c.eventTime ?? undefined,
        location: c.location ?? undefined,
        changeSummary: c.changeSummary ?? undefined,
        eventId: row.event_id ?? undefined,
      };

    case "social_post": {
      const rawPaths = (c as Record<string, unknown>).imagePaths;
      const paths: string[] = Array.isArray(rawPaths)
        ? rawPaths.filter((p): p is string => typeof p === "string")
        : c.imagePath
          ? [c.imagePath]
          : [];
      const imageUrls = paths
        .map((p) => publicImageUrl(p))
        .filter((u): u is string => Boolean(u));
      return {
        ...base,
        type: "social_post",
        senderName: c.senderName ?? "A friend",
        imageUrls,
        imageUrl: imageUrls[0] ?? "",
        caption: c.caption ?? undefined,
        eventTitle: c.eventTitle ?? undefined,
      };
    }

    default:
      return null;
  }
}

/** Columns the feed selects, kept in one place. */
export const CARD_SELECT =
  "id, type, title, content, status, created_at, sender_id, event_id";
