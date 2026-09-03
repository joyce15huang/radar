import { describe, it, expect } from "vitest";
import {
  AVAIL_WEIGHT,
  slotId,
  scoreSlot,
  scoreGrid,
  bestSlots,
  tallyOption,
  rankOptions,
  suggestAvail,
  type Participant,
  type PollRespondent,
} from "./schedule";
import type { BusyInterval } from "./conflicts";

/* --------------------------------- grid ----------------------------------- */

describe("grid scoring", () => {
  const people: Participant[] = [
    { id: "a", name: "A", weight: 1, avail: { [slotId(0, 0)]: 2, [slotId(0, 1)]: 1 } },
    { id: "b", name: "B", weight: 2, avail: { [slotId(0, 0)]: 2, [slotId(0, 1)]: 0 } }, // weight 2
  ];

  it("weights stances by AVAIL_WEIGHT and participant weight", () => {
    const s = scoreSlot(people, 0, 0); // both free: 1*2 + 2*2 = 6
    expect(s.score).toBe(6);
    expect(s.max).toBe(6);
    expect(s.freeCount).toBe(2);
    expect(AVAIL_WEIGHT[1]).toBe(1);
  });

  it("counts maybe and out correctly", () => {
    const s = scoreSlot(people, 0, 1); // A maybe (1*1), B out (0) => 1
    expect(s.score).toBe(1);
    expect(s.maybeCount).toBe(1);
    expect(s.outCount).toBe(1);
    expect(s.free).toEqual([]);
  });

  it("bestSlots ranks by score then earliest, dropping empty slots", () => {
    const grid = scoreGrid(people, 1, 2);
    const best = bestSlots(grid, 2);
    expect(best[0].time).toBe(0); // score 6 wins
    expect(best[1].time).toBe(1); // score 1
  });
});

/* ------------------------------ discrete poll ----------------------------- */

describe("discrete option poll", () => {
  const respondents: PollRespondent[] = [
    { id: "u1", name: "Ann", responses: { o1: 2, o2: 1, o3: 0 } },
    { id: "u2", name: "Ben", responses: { o1: 2, o2: 2, o3: 0 } },
    { id: "u3", name: "Cid", responses: { o1: 1, o2: 2 } }, // no answer on o3
  ];

  it("tallies a single option with names bucketed", () => {
    const t = tallyOption("o1", respondents);
    expect(t.score).toBe(2 + 2 + 1); // 5, equal weight
    expect(t.free).toEqual(["Ann", "Ben"]);
    expect(t.maybe).toEqual(["Cid"]);
    expect(t.responseCount).toBe(3);
  });

  it("ignores non-responders in a slot", () => {
    const t = tallyOption("o3", respondents);
    expect(t.responseCount).toBe(2); // Cid didn't answer o3
    expect(t.noCount).toBe(2);
    expect(t.score).toBe(0);
  });

  it("ranks best-first: score, then fewest No, then host order", () => {
    const ranked = rankOptions(["o1", "o2", "o3"], respondents);
    // o1 = 2+2+1 = 5, o2 = 1+2+2 = 5, o3 = 0. o1 & o2 fully tie (score 5, 0 No,
    // 1 maybe each) → host order keeps o1 first. o3 last.
    expect(ranked.map((r) => r.optionId)).toEqual(["o1", "o2", "o3"]);
  });

  it("uses host order as the final deterministic tiebreak", () => {
    const tied: PollRespondent[] = [{ id: "x", name: "X", responses: { a: 2, b: 2 } }];
    expect(rankOptions(["a", "b"], tied).map((r) => r.optionId)).toEqual(["a", "b"]);
    expect(rankOptions(["b", "a"], tied).map((r) => r.optionId)).toEqual(["b", "a"]);
  });
});

/* --------------------------- calendar auto-default ------------------------- */

describe("suggestAvail (calendar default)", () => {
  const busy: BusyInterval[] = [
    { title: "Standup", startMs: 100, endMs: 200, startIso: "", endIso: null },
  ];

  it("returns No (0) when the option overlaps a busy block", () => {
    expect(suggestAvail(150, 250, busy)).toBe(0);
  });

  it("returns Free (2) when the option is clear", () => {
    expect(suggestAvail(300, 400, busy)).toBe(2);
  });

  it("returns null when the option has no concrete time", () => {
    expect(suggestAvail(null, null, busy)).toBeNull();
    expect(suggestAvail(100, 100, busy)).toBeNull(); // zero-length
  });

  it("treats back-to-back as clear (half-open)", () => {
    expect(suggestAvail(200, 300, busy)).toBe(2); // starts exactly when busy ends
  });
});
