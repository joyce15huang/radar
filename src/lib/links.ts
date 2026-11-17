// Find and shorten links in plain text. Pure and client-safe.

export type TextPart = { kind: "text"; text: string } | { kind: "link"; href: string; label: string };

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"'`]*/gi;

/** A link's href, or null if it isn't a plain http(s) address. */
export function safeHref(raw: string): string | null {
  const v = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** "instagram.com/p/C9x…" — host without www, then as much path as fits. */
export function shortUrl(href: string, max = 32): string {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, "");
    const rest = (u.pathname === "/" ? "" : u.pathname) + u.search;
    const full = host + rest.replace(/\/$/, "");
    return full.length <= max ? full : `${full.slice(0, Math.max(host.length + 2, max - 1))}…`;
  } catch {
    return href.length <= max ? href : `${href.slice(0, max - 1)}…`;
  }
}

/** Split text into plain runs and links (trailing punctuation stays text). */
export function splitLinks(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[0];
    const trail = raw.match(/[.,!?;:)\]}]+$/)?.[0] ?? "";
    if (trail) raw = raw.slice(0, -trail.length);
    const start = m.index ?? 0;
    const href = safeHref(raw);
    if (!href) continue;
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    out.push({ kind: "link", href, label: shortUrl(href) });
    last = start + raw.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** The first link in some text, if any. */
export function firstLink(text: string): string | null {
  return splitLinks(text).find((p) => p.kind === "link")?.href ?? null;
}
