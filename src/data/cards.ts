import type { DigestCardData } from "@/lib/types";

/**
 * PIVOT PHASE 1 — hardcoded mock deck.
 *
 * A mixed deck containing all four card types, so we can design and iterate on
 * the taxonomy rendering before the schema + social engine land (Phase 2/3).
 * Replaced by a Supabase query for today's `pending` cards in Phase 2.
 */
export const SEED_CARDS: DigestCardData[] = [
  {
    id: "m01",
    type: "calendar_radar",
    title: "Design review with Priya",
    time: "Today · 2:30 PM",
    location: "Google Meet",
    details: "She shared the new onboarding Figma this morning — worth a 10-min skim first.",
    status: "pending",
    createdAt: "2026-08-07T06:00:00-07:00",
  },
  {
    id: "m02",
    type: "social_ping",
    senderName: "Marcus Lee",
    message:
      "saw this and thought of your NVDA thesis — the data-center capex numbers are wild. no rush, just a weekend read 👀",
    link: "https://www.reuters.com/technology",
    status: "pending",
    createdAt: "2026-08-06T21:14:00-07:00",
  },
  {
    id: "m03",
    type: "social_invite",
    senderName: "Dana Kim",
    eventTitle: "Rooftop dinner + board games",
    eventTime: "Sat, Aug 9 · 7:00 PM",
    location: "Dana's place, Hayes Valley",
    note: "Low-key, bringing the *good* snacks. Let me know if you're in!",
    status: "pending",
    createdAt: "2026-08-06T19:40:00-07:00",
  },
  {
    id: "m04",
    type: "news_scout",
    category: "finance",
    title: "NVDA closed up 2.4% ahead of earnings",
    summary:
      "Your watched ticker **NVDA** finished at a two-week high on data-center demand chatter. Options desks are pricing a larger-than-usual move into next week's print. No action needed — just on your radar.",
    actionLabel: "Open the chart",
    actionUrl: "https://finance.yahoo.com/quote/NVDA",
    status: "pending",
    createdAt: "2026-08-07T04:00:00-07:00",
  },
  {
    id: "m05",
    type: "social_ping",
    senderName: "Priya Rao",
    message: "running 5 min late to the 2:30 — start without me if I'm not there 🙏",
    status: "pending",
    createdAt: "2026-08-07T05:20:00-07:00",
  },
  {
    id: "m06",
    type: "news_scout",
    category: "local",
    title: "Free outdoor jazz in Yerba Buena Gardens, Sat 1pm",
    summary:
      "The summer series returns two blocks from you with a *no-ticket* afternoon set. Bring a blanket; food trucks line Mission St. A low-effort way to be outside this weekend.",
    actionLabel: "Add to Calendar",
    actionUrl: "https://ybgfestival.org",
    status: "pending",
    createdAt: "2026-08-07T04:00:00-07:00",
  },
  {
    id: "m07",
    type: "news_scout",
    category: "tech",
    title: "A small AI startup you follow raised a seed round",
    summary:
      "The eval-tooling company from your reading list closed funding to build **regression testing for LLM agents**. They're hiring two founding engineers. A useful signal on where agent infra is heading.",
    actionLabel: "See the details",
    actionUrl: "https://news.ycombinator.com",
    status: "pending",
    createdAt: "2026-08-07T04:00:00-07:00",
  },
  {
    id: "m08",
    type: "calendar_radar",
    title: "Dentist — 6-month cleaning",
    time: "Mon, Aug 11 · 9:00 AM",
    location: "Downtown Dental, Montgomery St",
    status: "pending",
    createdAt: "2026-08-07T06:00:00-07:00",
  },
  {
    id: "m09",
    type: "news_scout",
    category: "health",
    title: "Air quality is good today — a rare clear window",
    summary:
      "AQI is sitting at **32 (Good)** with light wind off the bay. If you've been putting off a run, today's the day before the weekend haze rolls back in.",
    actionLabel: "Check the hourly",
    actionUrl: "https://www.airnow.gov",
    status: "pending",
    createdAt: "2026-08-07T04:00:00-07:00",
  },
];
