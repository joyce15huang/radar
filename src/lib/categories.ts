import {
  Cpu,
  MapPin,
  LineChart,
  CalendarDays,
  ClipboardCheck,
  Globe2,
  HeartPulse,
  Palette,
  type LucideIcon,
} from "lucide-react";
import type { CategoryKey } from "./types";

export interface CategoryMeta {
  /** Human label shown in the tag, e.g. "Tech". */
  label: string;
  /** Hashtag form shown on the card, e.g. "#Tech". */
  tag: string;
  icon: LucideIcon;
  /**
   * Tailwind classes for the category tag chip. Tuned to read calmly in both
   * light and dark mode — soft tint background, legible foreground.
   */
  chipClass: string;
  /** Accent color used for the thin left rail on each card. */
  railClass: string;
}

export const CATEGORIES: Record<CategoryKey, CategoryMeta> = {
  tech: {
    label: "Tech",
    tag: "#Tech",
    icon: Cpu,
    chipClass:
      "bg-violet-50 text-violet-700 ring-violet-200/70 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
    railClass: "bg-violet-400/80",
  },
  local: {
    label: "Local",
    tag: "#Local",
    icon: MapPin,
    chipClass:
      "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    railClass: "bg-emerald-400/80",
  },
  finance: {
    label: "Finance",
    tag: "#Finance",
    icon: LineChart,
    chipClass:
      "bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
    railClass: "bg-amber-400/80",
  },
  schedule: {
    label: "Schedule",
    tag: "#Schedule",
    icon: CalendarDays,
    chipClass:
      "bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
    railClass: "bg-sky-400/80",
  },
  admin: {
    label: "Life Admin",
    tag: "#LifeAdmin",
    icon: ClipboardCheck,
    chipClass:
      "bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
    railClass: "bg-rose-400/80",
  },
  world: {
    label: "World",
    tag: "#World",
    icon: Globe2,
    chipClass:
      "bg-slate-100 text-slate-700 ring-slate-200/70 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/20",
    railClass: "bg-slate-400/80",
  },
  health: {
    label: "Health",
    tag: "#Health",
    icon: HeartPulse,
    chipClass:
      "bg-teal-50 text-teal-700 ring-teal-200/70 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20",
    railClass: "bg-teal-400/80",
  },
  culture: {
    label: "Culture",
    tag: "#Culture",
    icon: Palette,
    chipClass:
      "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200/70 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/20",
    railClass: "bg-fuchsia-400/80",
  },
};
