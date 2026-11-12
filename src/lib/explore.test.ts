import { describe, expect, it } from "vitest";
import { scopeWindow } from "./explore";

const TZ = "America/Los_Angeles";
const at = (iso: string) => Date.parse(iso);

describe("scopeWindow", () => {
  it("this week from a Wednesday runs from now to Monday", () => {
    const w = scopeWindow("weekend", TZ, at("2026-11-18T20:00:00Z")); // Wed noon PT
    expect(w.from).toBe("2026-11-18T20:00:00.000Z");
    expect(w.to).toBe("2026-11-23T08:00:00.000Z");
  });
  it("weekend on a Saturday starts now and still ends Monday", () => {
    const now = at("2026-11-21T20:00:00Z");
    const w = scopeWindow("weekend", TZ, now);
    expect(Date.parse(w.from)).toBe(now);
    expect(w.to).toBe("2026-11-23T08:00:00.000Z");
  });
  it("next week is the Monday after, seven days", () => {
    const w = scopeWindow("week", TZ, at("2026-11-18T20:00:00Z"));
    expect(w.from).toBe("2026-11-23T08:00:00.000Z");
    expect(w.to).toBe("2026-11-30T08:00:00.000Z");
  });
  it("Sunday still belongs to this weekend", () => {
    const w = scopeWindow("weekend", TZ, at("2026-11-22T20:00:00Z"));
    expect(w.to).toBe("2026-11-23T08:00:00.000Z");
  });
});
