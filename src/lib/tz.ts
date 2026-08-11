import { cookies } from "next/headers";

const FALLBACK_TZ = "America/Los_Angeles";

/** Validates an IANA timezone id; returns the fallback if invalid/empty. */
export function safeTimeZone(tz: string | undefined | null): string {
  if (!tz) return FALLBACK_TZ;
  try {
    // Throws RangeError for an unknown timezone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return FALLBACK_TZ;
  }
}

/**
 * The viewer's timezone, read from the `tz` cookie that `TimeZoneSync` sets on
 * the client. Falls back to Pacific until the cookie is present (first load).
 */
export async function serverTimeZone(): Promise<string> {
  const store = await cookies();
  return safeTimeZone(store.get("tz")?.value);
}
