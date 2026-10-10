import Anthropic from "@anthropic-ai/sdk";
import type { CategoryKey } from "@/lib/types";

// Models (verified current as of 2026): Haiku for cheap query-writing, Sonnet
// for higher-quality card synthesis. Swap to pinned snapshots for production.
const QUERY_MODEL = "claude-haiku-4-5";
const SYNTHESIS_MODEL = "claude-sonnet-5";

export const CATEGORY_KEYS: CategoryKey[] = [
  "tech",
  "local",
  "finance",
  "schedule",
  "admin",
  "world",
  "health",
  "culture",
];

/**
 * Categories the SCOUT may use. "schedule" and "admin" are reserved for the
 * user's own calendar / life-admin items and must never be applied to scouted
 * news (otherwise team/event news lands under the personal-schedule chip).
 */
export const SCOUT_CATEGORY_KEYS: CategoryKey[] = CATEGORY_KEYS.filter(
  (k) => k !== "schedule" && k !== "admin",
);

export type DigestKind = "daily" | "weekly";

export interface ScoutQuery {
  query: string;
  topic: "general" | "news";
}

export interface GeneratedCard {
  /**
   * "time_window" for an event/opportunity with a real date or defined period;
   * "scout" only for a genuinely timeless standing gem.
   */
  kind: "scout" | "time_window";
  category: CategoryKey;
  title: string;
  summary: string;
  /** Neighborhood + city, e.g. "Mission Bay, San Francisco". From the source only. */
  place?: string | null;
  /** "Free", "$15", "~$15–25 per person". Only when the source states a price. */
  cost?: string | null;
  action_label: string;
  action_url: string | null;
  /**
   * ISO the event STARTS. Includes the clock time WITH the city's UTC offset
   * when the source states one (e.g. "2026-08-11T20:00:00-07:00"); a bare date
   * ("2026-08-11") when only a day is known. Never invented.
   */
  opens_at?: string | null;
  /** ISO the event ENDS / the last day to act (event end, festival last day,
   *  season end, lottery deadline). Never invented. */
  expires_at?: string | null;
  /** Short human phrase for a fuzzy/seasonal period ("May–August", "Ongoing"). */
  window_label?: string | null;
  /**
   * A 1-3 word label of WHAT the thing is, shown on the deck for undated cards
   * (e.g. "Stargazing", "Live music", "Farmers market", "National park",
   * "Street fair", "Whale watching"). Concrete, not a category word.
   */
  topic?: string | null;
  /**
   * A canonical kebab-case slug for the SPECIFIC underlying event/occurrence,
   * stable across outlets and headlines (e.g. "perseids-meteor-shower",
   * "outside-lands-festival"). The app scopes it to the event's month and uses
   * it to avoid re-showing the same event from a different source. Null only for
   * a truly generic standing gem.
   */
  topic_key?: string | null;
}

// Lazily construct the client so a missing key doesn't throw at import/build time.
let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY.");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/** Pulls the first tool_use input out of a message, typed. */
function toolInput<T>(msg: Anthropic.Message): T | null {
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return null;
  return block.input as T;
}

/** Turn a user's plain-English interests into a handful of web search queries. */
export async function generateSearchQueries(
  standingPrompt: string,
  todayISO: string,
  kind: DigestKind,
): Promise<ScoutQuery[]> {
  const window =
    kind === "weekly"
      ? "Focus on the past week's most important developments and anything happening in the week ahead."
      : "Focus on what's fresh and relevant for today.";

  const msg = await anthropic().messages.create({
    model: QUERY_MODEL,
    max_tokens: 1024,
    tools: [
      {
        name: "emit_queries",
        description: "Return web search queries to gather briefing material.",
        input_schema: {
          type: "object",
          properties: {
            queries: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  query: { type: "string" },
                  topic: { type: "string", enum: ["general", "news"] },
                },
                required: ["query", "topic"],
              },
            },
          },
          required: ["queries"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "emit_queries" },
    messages: [
      {
        role: "user",
        content: `Today is ${todayISO}. A user described their standing interests and location:\n\n"""${standingPrompt}"""\n\nThis is an "Opportunity Engine": it surfaces things to DO — hyper-local gems and, especially, TIME-SENSITIVE opportunities people miss because they didn't know in time. The user may list more than one location; spread your queries across each of them. Write 5-6 focused web search queries for the user's location(s). BREADTH MATTERS: each query must target a DIFFERENT kind of thing, so the deck isn't five versions of one story. Pick from:\n- Food & drink (chef pop-ups, food festivals, tastings, new openings)\n- Live music, arts & culture (shows, exhibits, readings, film nights)\n- Markets & community (street fairs, farmers/flea markets, neighborhood events)\n- Outdoors & nature (hikes, blooms, tides, wildlife) — AT MOST ONE query about the sky/astronomy\n- Sports & fitness (games, races, group runs, classes)\n- Permits, lotteries & registrations with deadlines\n- Learning & talks (workshops, lectures, meetups)\nLean toward the categories that match their stated interests, but never spend more than one query on the same kind of thing.\n${window} Prefer concrete queries (neighborhoods, venues, dates, event names) and sources that state exact dates and start times. Mark time-sensitive/dated queries with topic "news", evergreen ones with "general".`,
      },
    ],
  });

  return toolInput<{ queries?: ScoutQuery[] }>(msg)?.queries ?? [];
}

/** Synthesize the finished deck from fresh search context. */
export async function synthesizeCards(
  standingPrompt: string,
  todayISO: string,
  kind: DigestKind,
  context: string,
): Promise<GeneratedCard[]> {
  const framing =
    kind === "weekly"
      ? `This is the user's WEEKLY digest (it runs on Mondays). Favor bigger-picture, week-in-review and week-ahead items over minor daily noise.`
      : `This is the user's DAILY digest. Favor fresh, specific, timely items.`;

  const msg = await anthropic().messages.create({
    model: SYNTHESIS_MODEL,
    max_tokens: 4096,
    system: `You are the overnight scout for an "Opportunity Engine" — an anti-doomscroll app that surfaces things to DO. You turn raw web search results into a calm, finite deck of bite-sized cards. EVERY card is a real, attendable event or opportunity at or near the user's location — something they could put on a calendar — never generic news. ${framing}

Each card has a "kind":
- "time_window" — anything with a real date or a defined period: a one-time event on a given date/time (a show, poetry slam, market day, festival), a meteor shower peak, a permit lottery or registration deadline, or a seasonal/recurring window (a whale-watching season, a weekly farmers market). ALMOST EVERYTHING should be a time_window.
- "scout" — ONLY for a genuinely timeless standing gem with no date or season at all (e.g. a hidden viewpoint that's simply always there).

Timing — this is what makes a card useful, so get it exactly right, FROM THE SOURCE ONLY:
- opens_at = when it STARTS. If the source gives a clock time (e.g. "8pm on August 11"), output the FULL local datetime WITH the city's UTC offset, e.g. "2026-08-11T20:00:00-07:00" (US Pacific in summer). If only a day is given, output the bare date "2026-08-11".
- expires_at = when it ENDS or the last day to act: a one-evening event's end, a festival's last day, a season's end ("May–August" → the August end date), a lottery/registration deadline.
- window_label = a short human phrase for a fuzzy or seasonal period when there's no single instant ("May–August", "This weekend only", "Ongoing"). When an item has no exact day, prefer a phrase that captures the TIME OF DAY or period it happens ("Evenings", "After midnight", "Weekends", "10am–4pm") if the source implies one.
- CRITICAL: never invent a date or time — use only what the source supports. If a specific date isn't given but it's clearly seasonal/ongoing, set window_label (and expires_at only if the source states a real end). A wrong time or countdown destroys trust.

Rules:
- Ground every card in the provided search context. Use a REAL url from the context for action_url; never invent URLs. If no good source exists, set action_url to null.
- topic: ALWAYS set a 1-3 word label of WHAT the thing is — concrete and specific, not a category word. E.g. "Stargazing", "Live music", "Farmers market", "National park", "Whale watching", "Street fair", "Meteor shower", "Wine tasting". This is shown on undated cards so the user knows what it is at a glance.
- topic_key: ALWAYS set a canonical kebab-case slug for the SPECIFIC underlying event or occurrence, and make it STABLE across different outlets and headlines. E.g. "perseids-meteor-shower", "outside-lands-festival", "yosemite-firefall", "sf-cherry-blossom-festival". The SAME real event must get the SAME slug even when two sources word the headline differently — base it on the event itself (named phenomenon, plus place when needed to disambiguate), never on the headline's phrasing. This lets the app avoid showing the user the same event twice from different sources.
- Categories: choose from local, culture, tech, finance, world, health. NEVER use "schedule" or "admin" — those belong to the user's own calendar and life-admin, not scouted events. Local happenings, sports/teams, food, and concerts are "local" (or "culture"); markets/tickers are "finance"; space/science is "local" or "world".
- summary is a ONE-SENTENCE HOOK, 15 words max: the single detail that makes it worth doing (when/where/why). No background, no filler, no second sentence. Calm and factual — no hype, no clickbait.
- BREADTH: every card must be a DIFFERENT kind of thing. Never more than ONE card per topic (one meteor-shower card total, even if there are two showers or five outlets covering it). Spread the deck across food, music/arts, outdoors, markets/community, sports and learning when the context allows. Fewer, varied cards beat more, repetitive ones.
- place: the neighborhood and city, short ("Mission Bay, San Francisco", "Downtown Oakland", "Yosemite Valley"). Use the venue's area, not a street address. Null if the source doesn't say where.
- cost: what it costs to go, short: "Free", "$15", "$20–35", "~$15–25 per person" (use "~" for a range or estimate, add "per person" when it's clearly per head). ONLY from the source — if no price is stated, set null. Never guess.
- topic: use the SAME label for the same kind of thing every time (always "Meteor shower", never "Stargazing" for one and "Meteor shower" for another).
- Titles are punchy and specific, under ~60 characters.
- action_label: "Details" by default; use a specific verb only when it's clearly the action ("Get tickets", "Enter lottery", "Register").`,
    tools: [
      {
        name: "emit_cards",
        description: "Return the finished deck of Micro-Dossier Cards.",
        input_schema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              minItems: 5,
              maxItems: 10,
              items: {
                type: "object",
                properties: {
                  kind: {
                    type: "string",
                    enum: ["scout", "time_window"],
                    description: "'time_window' for anything with a real date/period; 'scout' only for a timeless standing gem.",
                  },
                  category: { type: "string", enum: SCOUT_CATEGORY_KEYS },
                  title: { type: "string" },
                  summary: {
                    type: "string",
                    description: "ONE-sentence hook, 15 words max. The key detail that makes it worth doing. No filler.",
                  },
                  place: {
                    type: ["string", "null"],
                    description: "Neighborhood + city, short (e.g. 'Mission Bay, San Francisco'). Area, not street address. Null if unknown.",
                  },
                  cost: {
                    type: ["string", "null"],
                    description: "Price to attend, short: 'Free', '$15', '$20–35', '~$15–25 per person'. Only if the source states it; else null.",
                  },
                  topic: {
                    type: ["string", "null"],
                    description: "1-3 word label of WHAT this is (e.g. 'Stargazing', 'Live music', 'Farmers market', 'National park', 'Whale watching', 'Street fair'). Concrete, not a category word.",
                  },
                  topic_key: {
                    type: ["string", "null"],
                    description: "Canonical kebab-case slug for the SPECIFIC underlying event/occurrence, STABLE across outlets and headlines (e.g. 'perseids-meteor-shower', 'outside-lands-festival'). The same real event must get the same slug even when headlines differ; base it on the event itself, not the wording. Null only for a truly generic standing gem.",
                  },
                  action_label: {
                    type: "string",
                    description: "'Details' by default; a specific verb only when clearly the action ('Get tickets', 'Enter lottery', 'Register').",
                  },
                  action_url: {
                    type: ["string", "null"],
                    description: "A real source URL from the context, or null.",
                  },
                  opens_at: {
                    type: ["string", "null"],
                    description: "ISO the event STARTS. Include the clock time WITH the city's UTC offset when the source gives one (e.g. '2026-08-11T20:00:00-07:00'); else a bare date. Never invented.",
                  },
                  expires_at: {
                    type: ["string", "null"],
                    description: "ISO the event ENDS / last day to act (event end, festival last day, season end, deadline). Never invented.",
                  },
                  window_label: {
                    type: ["string", "null"],
                    description: "Short phrase for a fuzzy/seasonal period or time-of-day when no single instant applies (e.g. 'May–August', 'Evenings', '10am–4pm').",
                  },
                },
                required: ["kind", "category", "title", "summary", "action_label", "action_url", "topic", "topic_key"],
              },
            },
          },
          required: ["cards"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "emit_cards" },
    messages: [
      {
        role: "user",
        content: `Today is ${todayISO}. The user's interests:\n"""${standingPrompt}"""\n\nToday's fresh web search context (JSON):\n${context}\n\nProduce the deck now.`,
      },
    ],
  });

  return toolInput<{ cards?: GeneratedCard[] }>(msg)?.cards ?? [];
}
