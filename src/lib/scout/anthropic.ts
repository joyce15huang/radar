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
   * "time_window" for an expiring opportunity with a REAL deadline from the
   * source; "scout" for an evergreen local gem / discovery item.
   */
  kind: "scout" | "time_window";
  category: CategoryKey;
  title: string;
  summary: string;
  action_label: string;
  action_url: string | null;
  /** time_window only — ISO date/datetime the window closes. Never invented. */
  expires_at?: string | null;
  /** time_window only — ISO date/datetime the window opens, if relevant. */
  opens_at?: string | null;
  /** time_window only — soft window label when no machine date exists. */
  window_label?: string | null;
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
        content: `Today is ${todayISO}. A user described their standing interests and location:\n\n"""${standingPrompt}"""\n\nThis is an "Opportunity Engine": it surfaces things to DO — hyper-local gems and, especially, TIME-SENSITIVE opportunities people miss because they didn't know in time. The user may list more than one location; spread your queries across each of them. Write 4-6 focused web search queries that surface, for the user's location(s):\n- Astrotourism & nature windows (meteor showers, aurora visibility, tides, blooms, whale/butterfly migrations)\n- Permits & lotteries with deadlines (park permits, campsite lotteries, race registrations)\n- Hyper-local pop-ups & one-off events (chef pop-ups, sample sales, street fairs, festivals)\n- Notable local happenings and hidden gems tied to their stated interests\n${window} Prefer concrete queries (neighborhoods, venues, dates, event names). Mark time-sensitive/dated queries with topic "news", evergreen ones with "general".`,
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
    system: `You are the overnight scout for an "Opportunity Engine" — an anti-doomscroll app that surfaces things to DO. You turn raw web search results into a calm, finite deck of bite-sized cards, tilted toward local gems and TIME-SENSITIVE opportunities the user would regret missing. ${framing}

Each card has a "kind":
- "time_window" — anything with a specific date or deadline: an event on given dates (festival, show, market day, exhibit), a meteor shower peaking, a permit lottery or registration closing, a weekend-only pop-up, a seasonal window. Set expires_at to the ISO date it ends / the last day to act, and opens_at when it hasn't started yet — both taken FROM THE SOURCE.
- "scout" — an evergreen local gem or discovery with genuinely no date (a hidden viewpoint, a classic bookstore, a standing weekly market).

Rules:
- Prefer time_window whenever a real date exists. An event that is upcoming, or happening within the next couple of weeks, with a known date should be a time_window — NOT a scout card. That countdown is the whole point of the app. Use scout only for dateless gems, and skip anything already past.
- CRITICAL: never invent a date. Only set expires_at/opens_at to a date you can support from the source. If something is time-sensitive but you can't find an exact date, use kind "scout" (optionally set window_label to a soft phrase like "This weekend only"). A wrong countdown destroys trust.
- Ground every card in the provided search context. Use a REAL url from the context for action_url; never invent URLs. If no good source exists, set action_url to null.
- Categories: choose from local, culture, tech, finance, world, health. NEVER use "schedule" or "admin" — those belong to the user's own calendar and life-admin, not scouted news. Local happenings, sports/teams, food, and concerts are "local" (or "culture"); markets/tickers are "finance"; space/science is "local" or "world".
- Keep summaries to 2-3 sentences, factual and low-anxiety. No hype, no clickbait, no fear-mongering.
- Avoid near-duplicate cards. Titles are punchy and specific (aim under ~70 characters).`,
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
                    description: "'time_window' only if a REAL deadline/date is in the source; else 'scout'.",
                  },
                  category: { type: "string", enum: SCOUT_CATEGORY_KEYS },
                  title: { type: "string" },
                  summary: {
                    type: "string",
                    description: "2-3 calm sentences. May use **bold** or *italic*.",
                  },
                  action_label: {
                    type: "string",
                    description: "Short button label, e.g. 'Read more', 'Open lottery', 'View details'.",
                  },
                  action_url: {
                    type: ["string", "null"],
                    description: "A real source URL from the context, or null.",
                  },
                  expires_at: {
                    type: ["string", "null"],
                    description: "time_window only: ISO date/datetime the window CLOSES, from the source. Never invented.",
                  },
                  opens_at: {
                    type: ["string", "null"],
                    description: "time_window only: ISO date/datetime the window OPENS, if relevant. Else null.",
                  },
                  window_label: {
                    type: ["string", "null"],
                    description: "Optional soft window phrase when no machine date exists (e.g. 'This weekend only').",
                  },
                },
                required: ["kind", "category", "title", "summary", "action_label", "action_url"],
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
