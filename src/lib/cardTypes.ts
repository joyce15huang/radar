import {
  MessageCircle,
  PartyPopper,
  Newspaper,
  Hourglass,
  Clock,
  Image as ImageIcon,
  PencilLine,
  type LucideIcon,
} from "lucide-react";
import type { CardType } from "./types";

export interface CardTypeMeta {
  label: string;
  icon: LucideIcon;
  /** Tag chip styling (calm in light + dark). */
  chipClass: string;
  /** Left accent rail color. */
  railClass: string;
}

export const CARD_TYPES: Record<CardType, CardTypeMeta> = {
  social_ping: {
    label: "Ping",
    icon: MessageCircle,
    chipClass:
      "bg-indigo-50 text-indigo-700 ring-indigo-200/70 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
    railClass: "bg-indigo-400/80",
  },
  social_invite: {
    label: "Invite",
    icon: PartyPopper,
    chipClass:
      "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200/70 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/20",
    railClass: "bg-fuchsia-400/80",
  },
  news_scout: {
    label: "Scout",
    icon: Newspaper,
    chipClass:
      "bg-slate-100 text-slate-700 ring-slate-200/70 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/20",
    railClass: "bg-slate-400/80",
  },
  time_window: {
    label: "Window",
    icon: Hourglass,
    chipClass:
      "bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
    railClass: "bg-amber-500/80",
  },
  calendar_radar: {
    label: "Schedule",
    icon: Clock,
    chipClass:
      "bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
    railClass: "bg-sky-400/80",
  },
  social_post: {
    label: "Post",
    icon: ImageIcon,
    chipClass:
      "bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
    railClass: "bg-rose-400/80",
  },
  event_update: {
    label: "Updated",
    icon: PencilLine,
    chipClass:
      "bg-violet-50 text-violet-700 ring-violet-200/70 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
    railClass: "bg-violet-400/80",
  },
};

/** Initials for a friend's name, e.g. "Priya Rao" → "PR". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
