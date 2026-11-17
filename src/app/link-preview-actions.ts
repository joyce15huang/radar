"use server";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getActor } from "@/lib/actor";
import { safeHref } from "@/lib/links";

export interface LinkPreview {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  site: string;
}

const TTL_MS = 6 * 3_600_000;
const MAX_BYTES = 400_000;
const cache = new Map<string, { at: number; v: LinkPreview | null }>();

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}
function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

/** Only public web servers: no internal addresses, odd ports or credentials. */
async function publicTarget(u: URL): Promise<boolean> {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIP(host)) return !privateIp(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address));
  } catch {
    return false;
  }
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const k = key.replace(/[:]/g, "\\:");
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i"));
    const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
    const v = a?.[1] ?? b?.[1];
    if (v && decode(v)) return decode(v);
  }
  return null;
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  void reader.cancel().catch(() => {});
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

/** Title / image / site for a link, read from the page's preview tags. Null when there's nothing useful. */
export async function getLinkPreview(raw: string): Promise<LinkPreview | null> {
  if (!(await getActor())) return null;
  const href = typeof raw === "string" ? safeHref(raw.slice(0, 600)) : null;
  if (!href) return null;
  const hit = cache.get(href);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;

  let v: LinkPreview | null = null;
  try {
    let url = new URL(href);
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      if (!(await publicTarget(url))) break;
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; BlipClubPreview/1.0)", accept: "text/html" },
      });
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!loc) break;
      url = new URL(loc, url);
      res = null;
    }
    if (res?.ok && (res.headers.get("content-type") ?? "").includes("html")) {
      const html = await readCapped(res);
      const title = meta(html, ["og:title", "twitter:title"]) ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
      if (title) {
        const img = meta(html, ["og:image", "og:image:url", "twitter:image"]);
        let image: string | null = null;
        if (img) {
          try {
            const iu = new URL(img, url);
            image = iu.protocol === "https:" ? iu.toString() : null;
          } catch {}
        }
        v = {
          url: href,
          title: title.slice(0, 140),
          description: meta(html, ["og:description", "description", "twitter:description"])?.slice(0, 200) ?? null,
          image,
          site: meta(html, ["og:site_name"]) ?? url.hostname.replace(/^www\./, ""),
        };
      }
    }
  } catch {
    v = null;
  }
  if (cache.size > 500) cache.clear();
  cache.set(href, { at: Date.now(), v });
  return v;
}
