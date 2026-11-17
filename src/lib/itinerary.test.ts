import { describe, expect, it } from "vitest";
import { addDays, cleanItinerary, timeLabel, tripLabel } from "./itinerary";

describe("itinerary helpers", () => {
  it("adds days across months", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("labels a trip", () => {
    expect(tripLabel("2026-12-04", 3)).toBe("Fri, Dec 4 – Sun, Dec 6");
    expect(tripLabel("2026-12-04", 1)).toBe("Fri, Dec 4");
  });
  it("formats times", () => {
    expect(timeLabel("00:05")).toBe("12:05 AM");
    expect(timeLabel("17:00")).toBe("5:00 PM");
    expect(timeLabel(null)).toBe("");
  });
  it("cleans input: drops blank items, bad times, sorts by time", () => {
    const d = cleanItinerary([
      { items: [{ time: "21:00", title: " Check in " }, { time: "nope", title: "Snacks" }, { time: "17:00", title: "Drive", place: "" }, { time: null, title: "  " }] },
      { items: "x" },
    ]);
    expect(d).toEqual([
      { items: [{ time: "17:00", title: "Drive", place: null }, { time: "21:00", title: "Check in", place: null }, { time: null, title: "Snacks", place: null }] },
      { items: [] },
    ]);
    expect(cleanItinerary("junk")).toEqual([]);
    expect(cleanItinerary(Array.from({ length: 40 }, () => ({ items: [] }))).length).toBe(14);
  });
});
