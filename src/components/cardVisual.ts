// Visual identity for a deck card: a soft tint, an icon, and a short label.
// Lives under components/ so Tailwind's content scan keeps these classes.
import type { LucideIcon } from "lucide-react";
import {
  MoonStar,
  Utensils,
  Music,
  Palette,
  Trees,
  Store,
  Trophy,
  Ticket,
  Sparkles,
  Users,
  MessageCircle,
  CalendarClock,
  Vote,
  Megaphone,
  Bell,
  Cpu,
  LineChart,
  Globe,
  HeartPulse,
} from "lucide-react";
import type { DigestCardData } from "@/lib/types";

export interface CardVisual {
  /** Hero background tint. */
  bg: string;
  /** Icon color. */
  fg: string;
  /** Topic-pill text color (darker, for contrast on white). */
  pill: string;
  icon: LucideIcon;
  /** Fallback pill label when the card has no `topic`. */
  label: string;
}

const KIND = {
  sky: { bg: "bg-indigo-50", fg: "text-indigo-700", pill: "text-indigo-800", icon: MoonStar, label: "Night sky" },
  permit: { bg: "bg-slate-100", fg: "text-slate-700", pill: "text-slate-800", icon: Ticket, label: "Deadline" },
  music: { bg: "bg-fuchsia-50", fg: "text-fuchsia-700", pill: "text-fuchsia-800", icon: Music, label: "Live music" },
  arts: { bg: "bg-rose-50", fg: "text-rose-700", pill: "text-rose-800", icon: Palette, label: "Arts" },
  outdoors: { bg: "bg-emerald-50", fg: "text-emerald-700", pill: "text-emerald-800", icon: Trees, label: "Outdoors" },
  sports: { bg: "bg-sky-50", fg: "text-sky-700", pill: "text-sky-800", icon: Trophy, label: "Sports" },
  food: { bg: "bg-amber-50", fg: "text-amber-700", pill: "text-amber-800", icon: Utensils, label: "Food & drink" },
  market: { bg: "bg-orange-50", fg: "text-orange-700", pill: "text-orange-800", icon: Store, label: "Markets" },
} satisfies Record<string, CardVisual>;

const KEYWORDS: [keyof typeof KIND, RegExp][] = [
  ["sky", /meteor|stargaz|aurora|eclipse|moon|planet|astronom|comet|night sky/],
  ["permit", /permit|lottery|registration|deadline|apply by/],
  ["music", /music|concert|\bdj\b|jazz|band|symphony|opera|live set/],
  ["arts", /\bart\b|arts|exhibit|museum|gallery|film|movie|theat|comedy|reading|poetry|dance|book/],
  ["outdoors", /hike|trail|park|nature|whale|bloom|flower|beach|tide|camp|garden|wildlife|bird|kayak/],
  ["sports", /\brun\b|running|race|marathon|game|sports|yoga|climb|cycling|bike|soccer|basketball|baseball|fitness/],
  ["food", /food|dinner|brunch|lunch|tasting|wine|beer|cocktail|restaurant|chef|pop-?up|bakery|coffee|supper/],
  ["market", /market|fair|festival|street|flea|swap|bazaar/],
];

function byKeyword(text: string): CardVisual | null {
  const t = text.toLowerCase();
  for (const [k, re] of KEYWORDS) if (re.test(t)) return KIND[k];
  return null;
}

const NEUTRAL: CardVisual = { bg: "bg-neutral-100", fg: "text-neutral-700", pill: "text-neutral-800", icon: Sparkles, label: "Nearby" };

const BY_CATEGORY: Record<string, CardVisual> = {
  tech: { bg: "bg-cyan-50", fg: "text-cyan-700", pill: "text-cyan-800", icon: Cpu, label: "Tech" },
  finance: { bg: "bg-emerald-50", fg: "text-emerald-700", pill: "text-emerald-800", icon: LineChart, label: "Finance" },
  world: { bg: "bg-slate-100", fg: "text-slate-700", pill: "text-slate-800", icon: Globe, label: "World" },
  health: { bg: "bg-teal-50", fg: "text-teal-700", pill: "text-teal-800", icon: HeartPulse, label: "Health" },
  culture: KIND.arts,
};

export function cardVisual(card: DigestCardData): CardVisual {
  switch (card.type) {
    case "news_scout":
    case "time_window":
      return byKeyword(`${card.topic ?? ""} ${card.title}`) ?? BY_CATEGORY[card.category] ?? NEUTRAL;
    case "social_invite":
      return byKeyword(card.eventTitle) ?? { bg: "bg-rose-50", fg: "text-rose-700", pill: "text-rose-800", icon: Users, label: "Invite" };
    case "calendar_radar":
      return { bg: "bg-sky-50", fg: "text-sky-700", pill: "text-sky-800", icon: CalendarClock, label: "Your schedule" };
    case "event_update":
      return { bg: "bg-slate-100", fg: "text-slate-700", pill: "text-slate-800", icon: Bell, label: "Plan update" };
    case "time_poll":
      return { bg: "bg-violet-50", fg: "text-violet-700", pill: "text-violet-800", icon: Vote, label: "Find a time" };
    case "broadcast_bundle":
      return { bg: "bg-orange-50", fg: "text-orange-700", pill: "text-orange-800", icon: Megaphone, label: "Events" };
    case "social_ping":
      return { bg: "bg-sky-50", fg: "text-sky-700", pill: "text-sky-800", icon: MessageCircle, label: "Message" };
    case "social_post":
      return { bg: "bg-rose-50", fg: "text-rose-700", pill: "text-rose-800", icon: Sparkles, label: "Post" };
  }
}
