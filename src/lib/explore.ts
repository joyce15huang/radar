// Explore: time scopes + shapes for posts that carry dates. Pure helpers here;
// data lives in app/date-post-actions.ts (migration 0046).
import { addDays, localMidnightISO, ymd } from "./time";

export type Scope = "weekend" | "week" | "month";
export const SCOPES: { key: Scope; label: string }[] = [
  { key: "weekend", label: "This week" },
  { key: "week", label: "Next week" },
  { key: "month", label: "This month" },
];

export const CATEGORIES = ["food", "outdoors", "music", "arts", "sports", "other"] as const;
export type PostCategory = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<PostCategory, string> = {
  food: "Food",
  outdoors: "Outdoors",
  music: "Music",
  arts: "Arts",
  sports: "Sports",
  other: "Other",
};

/**
 * [from, to) for a scope, in `tz`. Every scope has an end, so browsing does too.
 *  - weekend: now → the coming Monday 00:00 (the rest of this week, weekend included)
 *  - week:    the Monday after that → the following Monday
 *  - month:   now → 31 days out
 */
export function scopeWindow(scope: Scope, tz: string, nowMs: number = Date.now()): { from: string; to: string } {
  const now = new Date(nowMs).toISOString();
  const today = ymd(now, tz);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  const monday = addDays(today, dow === 0 ? 1 : 8 - dow);
  if (scope === "week") return { from: localMidnightISO(monday, tz), to: localMidnightISO(addDays(monday, 7), tz) };
  if (scope === "month") return { from: now, to: localMidnightISO(addDays(today, 31), tz) };
  return { from: now, to: localMidnightISO(monday, tz) };
}

export interface PostDate {
  id: string;
  label: string;
  startsAt: string;
  allDay: boolean;
  location: string | null;
  /** Already on the viewer's calendar. */
  added: boolean;
}

export interface ExplorePost {
  id: string;
  title: string;
  body: string | null;
  imageUrls: string[];
  author: { id: string; name: string; isPublic: boolean };
  audience: "friends" | "public";
  category: string | null;
  sourceUrl: string | null;
  createdAt: string;
  mine: boolean;
  /** Every date on the post, soonest first. */
  dates: PostDate[];
  /** The first date inside the browsed window (Explore only). */
  next: PostDate | null;
  /** "You're free Sat" when the viewer has nothing on at that time. */
  freeTag: string | null;
  /** Friends who added a date from this post. */
  addedBy: string[];
}
