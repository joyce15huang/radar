import { describe, expect, it } from "vitest";
import { firstLink, shortUrl, splitLinks } from "./links";

describe("links", () => {
  it("finds links and keeps trailing punctuation as text", () => {
    const parts = splitLinks("Tickets: https://www.example.com/events/123?ref=ig. See you!");
    expect(parts).toEqual([
      { kind: "text", text: "Tickets: " },
      { kind: "link", href: "https://www.example.com/events/123?ref=ig", label: "example.com/events/123?ref=ig" },
      { kind: "text", text: ". See you!" },
    ]);
  });
  it("handles bare www links", () => {
    expect(firstLink("menu at www.kinkhao.com/menu")).toBe("https://www.kinkhao.com/menu");
  });
  it("ignores non-web schemes", () => {
    expect(splitLinks("javascript:alert(1)")).toEqual([{ kind: "text", text: "javascript:alert(1)" }]);
  });
  it("shortens long links", () => {
    const s = shortUrl("https://www.instagram.com/p/C9xYzAbCdEfGhIjKlMnOp/?igsh=abcdefghijklmnop");
    expect(s.length).toBeLessThanOrEqual(32);
    expect(s.startsWith("instagram.com/")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });
});
