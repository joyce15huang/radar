/** A same-site path to continue to after auth, or the fallback. Blocks open
 *  redirects ("//evil.com", "https://…", "/\\evil"). */
export function safeNext(raw: string | null | undefined, fallback = "/calendar"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
