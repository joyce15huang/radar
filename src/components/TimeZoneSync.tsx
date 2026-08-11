"use client";

import { useEffect } from "react";

/**
 * Records the viewer's IANA timezone in a cookie so server components and server
 * actions (date parsing, the Past/Upcoming cutoff, the date chips) render in the
 * user's local zone instead of a hardcoded default. Renders nothing.
 *
 * IANA ids are cookie-safe (letters, digits, "/", "_", "-"), so no encoding.
 */
export function TimeZoneSync() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const current = document.cookie
        .split("; ")
        .find((c) => c.startsWith("tz="))
        ?.slice(3);
      if (current === tz) return;
      document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // ignore — server falls back to a default zone
    }
  }, []);

  return null;
}
