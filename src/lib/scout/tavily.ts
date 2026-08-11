export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilyResponse {
  query: string;
  answer?: string;
  results: TavilyResult[];
}

export interface TavilyOptions {
  maxResults?: number;
  topic?: "general" | "news";
  /** e.g. "day" | "week" | "month" | "year" */
  timeRange?: string;
}

/**
 * Calls the Tavily Search API. Docs: https://docs.tavily.com
 * Key is passed as a Bearer token.
 */
export async function tavilySearch(
  query: string,
  opts: TavilyOptions = {},
): Promise<TavilyResponse> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("Missing TAVILY_API_KEY.");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      topic: opts.topic ?? "general",
      max_results: opts.maxResults ?? 5,
      include_answer: "basic",
      ...(opts.timeRange ? { time_range: opts.timeRange } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily error ${res.status}: ${body.slice(0, 300)}`);
  }

  return (await res.json()) as TavilyResponse;
}
