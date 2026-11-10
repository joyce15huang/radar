import { describe, expect, it } from "vitest";
import { chatClosesAt } from "./chat";

describe("chatClosesAt", () => {
  it("is 48h after the end when there is one", () => {
    expect(chatClosesAt("2026-11-06T16:00:00Z", "2026-11-08T22:00:00Z")).toBe("2026-11-10T22:00:00.000Z");
  });
  it("falls back to the start", () => {
    expect(chatClosesAt("2026-11-06T16:00:00Z", null)).toBe("2026-11-08T16:00:00.000Z");
  });
  it("never closes undated plans", () => {
    expect(chatClosesAt(null)).toBeNull();
    expect(chatClosesAt("soon")).toBeNull();
  });
});
