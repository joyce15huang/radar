import { describe, expect, it } from "vitest";
import { ago, isThisWeekend, titleFromBody, whenLabel } from "./openPosts";

const TZ = "America/Los_Angeles";
// Sat Nov 21 2026, 10:00 AM Pacific
const NOW = Date.parse("2026-11-21T18:00:00Z");

describe("open posts", () => {
  it("labels when", () => {
    expect(whenLabel("2026-11-22T03:00:00Z", true, TZ, NOW)).toBe("Tonight, 7 PM");
    expect(whenLabel("2026-11-21T20:30:00Z", true, TZ, NOW)).toBe("Today, 12:30 PM");
    expect(whenLabel("2026-11-22T17:00:00Z", false, TZ, NOW)).toBe("Tomorrow");
    expect(whenLabel("2026-11-28T17:00:00Z", true, TZ, NOW)).toBe("Sat, Nov 28, 9 AM");
    expect(whenLabel(null, false, TZ, NOW)).toBe("");
  });
  it("titles from the first line", () => {
    expect(titleFromBody("\n Bball tonight?\nchill")).toBe("Bball tonight?");
    expect(titleFromBody("x".repeat(80)).length).toBe(60);
  });
  it("ago + weekend", () => {
    expect(ago("2026-11-21T17:40:00Z", NOW)).toBe("20m");
    expect(isThisWeekend("2026-11-22T17:00:00Z", TZ, NOW)).toBe(true);
    expect(isThisWeekend("2026-11-24T17:00:00Z", TZ, NOW)).toBe(false);
    expect(isThisWeekend("2026-12-05T17:00:00Z", TZ, NOW)).toBe(false);
  });
});
