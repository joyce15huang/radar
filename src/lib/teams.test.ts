import { describe, expect, it } from "vitest";
import { answerOf, tally, shortBy, weeklyStarts, isoAt, gameTitle } from "./teams";

describe("teams helpers", () => {
  it("maps card state to answers", () => {
    expect(answerOf("accepted", {})).toBe("in");
    expect(answerOf("dismissed", { maybe: "true" })).toBe("out");
    expect(answerOf("pending", { maybe: "true" })).toBe("maybe");
    expect(answerOf("pending", null)).toBe("none");
  });

  it("tallies and reports shortfall", () => {
    const h = tally(["in", "in", "maybe", "none", "out"], 4);
    expect(h).toEqual({ in: 2, maybe: 1, out: 1, none: 1, min: 4 });
    expect(shortBy(h)).toBe(2);
    expect(shortBy({ ...h, min: null })).toBe(0);
  });

  it("anchors local time", () => {
    expect(isoAt("2026-10-15", "19:00", "America/Los_Angeles")).toBe("2026-10-16T02:00:00.000Z");
    expect(isoAt("2026-11-05", "19:00", "America/Los_Angeles")).toBe("2026-11-06T03:00:00.000Z");
  });

  it("repeats weekly across DST at the same wall-clock time", () => {
    const s = weeklyStarts("2026-10-29T19:00:00-07:00", "2026-11-12", "America/Los_Angeles");
    expect(s).toEqual([
      "2026-10-30T02:00:00.000Z",
      "2026-11-06T03:00:00.000Z",
      "2026-11-13T03:00:00.000Z",
    ]);
  });

  it("caps repeats", () => {
    expect(weeklyStarts("2026-01-01T10:00:00Z", "2027-12-31", "UTC", 5)).toHaveLength(5);
  });

  it("titles games", () => {
    expect(gameTitle({ title: "Game", opponent: "Mavs", homeAway: "away" })).toBe("at Mavs");
    expect(gameTitle({ title: "Game", opponent: "Mavs", homeAway: "home" })).toBe("vs. Mavs");
    expect(gameTitle({ title: "Practice", opponent: null, homeAway: null })).toBe("Practice");
  });
});
