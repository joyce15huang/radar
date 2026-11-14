import {
  generateSearchQueries,
  synthesizeCards,
  type GeneratedCard,
  type DigestKind,
} from "./anthropic";
import { tavilySearch } from "./tavily";
import { cleanCard, cleanQuery, cleanSubject, hostsOf, safeHttpUrl } from "./safety";

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
  rawSubject: string,
  todayISO: string,
  kind: DigestKind,
): Promise<GeneratedCard[]> {
  // The subject is something a user typed: place-name characters only, capped.
  const subject = cleanSubject(rawSubject);
  if (!subject) return [];

  const queries = (await generateSearchQueries(subject, todayISO, kind))
    .map((q) => ({ query: cleanQuery(q?.query), topic: q?.topic === "news" ? ("news" as const) : ("general" as const) }))
    .filter((q) => q.query.length >= 3);
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
          results: r.results
            .filter((x) => !!safeHttpUrl(x.url))
            .map(({ title, url, content, score }) => ({
              title: String(title ?? "").slice(0, 200),
              url,
              content: String(content ?? "").slice(0, 1200),
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
  const cards = await synthesizeCards(subject, todayISO, kind, context);

  // Whatever a web page managed to talk the model into, plain code has the last
  // word: text is clipped and stripped of links/markup, dates must parse, and a
  // card may only link to a site this search actually returned.
  const allowed = hostsOf(bundles.flatMap((b) => (b.results ?? []).map((r) => r.url)));
  return (Array.isArray(cards) ? cards : [])
    .slice(0, 10)
    .map((c) => (c && typeof c === "object" ? cleanCard(c, allowed) : null))
    .filter((c): c is GeneratedCard => c !== null);
}
