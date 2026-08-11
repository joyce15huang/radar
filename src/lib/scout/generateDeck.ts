import {
  generateSearchQueries,
  synthesizeCards,
  type GeneratedCard,
  type DigestKind,
} from "./anthropic";
import { tavilySearch } from "./tavily";

interface SearchBundle {
  query: string;
  answer?: string;
  results?: { title: string; url: string; content: string; score: number }[];
  error?: string;
}

/**
 * The full scout pipeline for one subject (a city, optionally with interests):
 *   subject -> LLM search queries -> Tavily searches -> LLM synthesis -> cards.
 * Returns [] when the subject is empty. Individual failed searches are tolerated.
 */
export async function generateDeck(
  subject: string,
  todayISO: string,
  kind: DigestKind,
): Promise<GeneratedCard[]> {
  if (!subject.trim()) return [];

  const queries = await generateSearchQueries(subject, todayISO, kind);
  if (queries.length === 0) return [];

  const bundles: SearchBundle[] = await Promise.all(
    queries.slice(0, 6).map(async (q): Promise<SearchBundle> => {
      try {
        const r = await tavilySearch(q.query, {
          topic: q.topic,
          maxResults: 5,
          // Event discovery: keep article dates recent-ish without over-narrowing.
          // Weekly casts a wider net to catch earlier-announced upcoming events.
          timeRange:
            q.topic === "news" ? (kind === "weekly" ? "month" : "week") : undefined,
        });
        return {
          query: q.query,
          answer: r.answer,
          results: r.results.map(({ title, url, content, score }) => ({
            title,
            url,
            content: content.slice(0, 1200),
            score,
          })),
        };
      } catch (e) {
        return { query: q.query, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  // Cap total context size to keep the synthesis call bounded.
  const context = JSON.stringify(bundles, null, 2).slice(0, 60000);
  return synthesizeCards(subject, todayISO, kind, context);
}
