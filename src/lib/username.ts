// Shared username helpers used by both the client form (instant feedback) and the
// server action (authoritative). Pure module — no "use server", safe to import
// anywhere.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
/** Lowercase letters, digits, and underscore. */
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export interface UsernameResult {
  ok: boolean;
  error?: string;
  /** True when the handle is valid but already claimed by someone else. */
  taken?: boolean;
  /** The saved (normalized) username on success. */
  username?: string;
}

/** Strip a leading @, trim, lowercase. */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** Validate a raw input, returning the normalized value or a human error. */
export function validateUsername(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const v = normalizeUsername(raw);
  if (v.length === 0) return { ok: false, error: "Pick a username." };
  if (v.length < USERNAME_MIN) return { ok: false, error: `At least ${USERNAME_MIN} characters.` };
  if (v.length > USERNAME_MAX) return { ok: false, error: `At most ${USERNAME_MAX} characters.` };
  if (!USERNAME_RE.test(v)) {
    return { ok: false, error: "Use only lowercase letters, numbers, and underscores." };
  }
  return { ok: true, value: v };
}
