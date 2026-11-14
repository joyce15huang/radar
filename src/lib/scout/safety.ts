/**
 * Guardrails for the scout. Everything the scout reads is untrusted — the city
 * a user typed and every web page a search returns — so both are cleaned on
 * the way in, and whatever the model writes is cleaned on the way out, in plain
 * code that a cleverly-worded page can't talk its way past.
 */

export const MAX_CITIES = 5;
const CITY_LEN = 60;
const SUBJECT_LEN = 240;

// Letters, digits, spaces and the punctuation real place names use.
const NOT_PLACE = /[^\p{L}\p{M}\p{N} ,.'’\-&()/:]/gu;

function clean(raw: unknown, max: number): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(NOT_PLACE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** A city a user typed: short, place-name characters only. "" when nothing usable is left. */
export function cleanCity(raw: unknown): string {
  return clean(raw, CITY_LEN);
}

/** What the scout is asked about (a city, or an older saved interests sentence). */
export function cleanSubject(raw: unknown): string {
  return clean(raw, SUBJECT_LEN);
}

/** An http(s) URL, or null. Blocks javascript:, data: and anything unparsable. */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > 600) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const host = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** The sites a search actually returned — the only places a card may link to. */
export function hostsOf(urls: string[]): Set<string> {
  const out = new Set<string>();
  for (const u of urls) {
    const h = host(u);
    if (h) out.add(h);
  }
  return out;
}

/** Keep a card's link only if it is plain http(s) AND points at a site the search returned. */
export function sourcedUrl(raw: unknown, allowed: Set<string>): string | null {
  const url = safeHttpUrl(raw);
  if (!url) return null;
  const h = host(url);
  return h && allowed.has(h) ? url : null;
}

/** Card text: one line, no markup, no pasted links, a hard length. */
export function clipText(raw: unknown, max: number): string {
  return String(raw ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** Model-written search queries: a handful, short, no operators that widen what's fetched. */
export function cleanQuery(raw: unknown): string {
  return clipText(raw, 160);
}

const isoish = (v: unknown): string | null => (typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : null);

export interface CardLike {
  title: string;
  summary: string;
  place?: string | null;
  cost?: string | null;
  topic?: string | null;
  topic_key?: string | null;
  action_label: string;
  action_url: string | null;
  opens_at?: string | null;
  expires_at?: string | null;
  window_label?: string | null;
}

/**
 * Clean one model-written card. Returns null when there's no usable title, so a
 * hijacked or garbled card is dropped rather than shown.
 */
export function cleanCard<T extends CardLike>(card: T, allowed: Set<string>): T | null {
  const title = clipText(card.title, 90);
  if (!title) return null;
  const slug = String(card.topic_key ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
  return {
    ...card,
    title,
    summary: clipText(card.summary, 220),
    place: clipText(card.place, 80) || null,
    cost: clipText(card.cost, 40) || null,
    topic: clipText(card.topic, 40) || null,
    topic_key: slug || null,
    action_label: clipText(card.action_label, 24) || "Details",
    action_url: sourcedUrl(card.action_url, allowed),
    opens_at: isoish(card.opens_at),
    expires_at: isoish(card.expires_at),
    window_label: clipText(card.window_label, 40) || null,
  };
}
