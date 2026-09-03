// Group-scheduling core — pure, deterministic, NO LLM.
//
// Two shapes share one weighting model:
//  • the open-ended availability GRID (scoreSlot / scoreGrid / bestSlots), and
//  • the host-driven discrete POLL of a few proposed times (tallyOption /
//    rankOptions), plus `suggestAvail` — the calendar auto-default.

import { overlaps, type BusyInterval } from "./conflicts";

/** A participant's stance on one time slot. */
export type Avail = 0 | 1 | 2; // 0 = busy / no, 1 = if need be, 2 = free

/** How much each stance counts toward a slot's score. */
export const AVAIL_WEIGHT: Record<Avail, number> = { 0: 0, 1: 1, 2: 2 };

export interface Participant {
  id: string;
  name: string;
  /** Importance weight — a host or key person can count for more. Default 1. */
  weight: number;
  /** slotId → stance; a missing slot means busy/unknown (0). */
  avail: Record<string, Avail>;
}

/** Stable id for a grid cell at (day column, time row). */
export function slotId(day: number, time: number): string {
  return `${day}:${time}`;
}

export interface SlotScore {
  day: number;
  time: number;
  /** Σ over participants of weight × AVAIL_WEIGHT[stance]. */
  score: number;
  /** Best possible score here (everyone free): Σ weight × 2. */
  max: number;
  freeCount: number;
  maybeCount: number;
  /** Participants not free (stance 0). */
  outCount: number;
  free: string[];
  maybe: string[];
  out: string[];
}

/** Score a single slot across all participants (pure). */
export function scoreSlot(participants: Participant[], day: number, time: number): SlotScore {
  const id = slotId(day, time);
  let score = 0;
  let max = 0;
  const free: string[] = [];
  const maybe: string[] = [];
  const out: string[] = [];
  for (const p of participants) {
    const w = p.weight > 0 ? p.weight : 1;
    max += w * 2;
    const a = (p.avail[id] ?? 0) as Avail;
    score += w * AVAIL_WEIGHT[a];
    if (a === 2) free.push(p.name);
    else if (a === 1) maybe.push(p.name);
    else out.push(p.name);
  }
  return {
    day,
    time,
    score,
    max,
    freeCount: free.length,
    maybeCount: maybe.length,
    outCount: out.length,
    free,
    maybe,
    out,
  };
}

/** Score every (day, time) slot — row-major by day then time (pure). */
export function scoreGrid(
  participants: Participant[],
  dayCount: number,
  timeCount: number,
): SlotScore[] {
  const out: SlotScore[] = [];
  for (let d = 0; d < dayCount; d++) {
    for (let t = 0; t < timeCount; t++) {
      out.push(scoreSlot(participants, d, t));
    }
  }
  return out;
}

/**
 * Rank slots for the "best time" pick: highest weighted score, then the fewest
 * people fully out, then earliest (day, then time). Slots with a zero score
 * (nobody available) are dropped. Provisional single-slot ranking for the grid;
 * step 2's `calculateOptimalTime` generalizes this to a meeting duration.
 */
export function bestSlots(scores: SlotScore[], topN = 1): SlotScore[] {
  return [...scores]
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.outCount - b.outCount ||
        a.day - b.day ||
        a.time - b.time,
    )
    .slice(0, topN);
}

/* ------------------------- discrete option poll --------------------------- */
// A host proposes a few candidate times; each invitee answers Free / If need be
// / No per option. Equal weight for now (a respondent may still carry a weight
// for a future "key people" mode). Only counts people who actually responded.

export interface PollRespondent {
  id: string;
  name: string;
  /** Importance weight; default 1 (equal weighting today). */
  weight?: number;
  /** optionId → stance; a missing option means no answer yet. */
  responses: Record<string, Avail>;
}

export interface OptionTally {
  optionId: string;
  /** Σ over responders of weight × AVAIL_WEIGHT[stance]. */
  score: number;
  free: string[];
  maybe: string[];
  no: string[];
  freeCount: number;
  maybeCount: number;
  noCount: number;
  /** People who have answered this option (free + maybe + no). */
  responseCount: number;
}

/** Tally one option across everyone who has responded to it (pure). */
export function tallyOption(optionId: string, respondents: PollRespondent[]): OptionTally {
  let score = 0;
  const free: string[] = [];
  const maybe: string[] = [];
  const no: string[] = [];
  for (const r of respondents) {
    const a = r.responses[optionId];
    if (a === undefined) continue; // hasn't answered this option
    const w = r.weight && r.weight > 0 ? r.weight : 1;
    score += w * AVAIL_WEIGHT[a];
    if (a === 2) free.push(r.name);
    else if (a === 1) maybe.push(r.name);
    else no.push(r.name);
  }
  return {
    optionId,
    score,
    free,
    maybe,
    no,
    freeCount: free.length,
    maybeCount: maybe.length,
    noCount: no.length,
    responseCount: free.length + maybe.length + no.length,
  };
}

/**
 * Rank the proposed options best-first: highest weighted score, then fewest
 * hard No's, then fewest maybes, then the host's original option order as the
 * final deterministic tiebreak. `optionIds` is in host order.
 */
export function rankOptions(optionIds: string[], respondents: PollRespondent[]): OptionTally[] {
  const order = new Map(optionIds.map((id, i) => [id, i] as const));
  return optionIds
    .map((id) => tallyOption(id, respondents))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.noCount - b.noCount ||
        a.maybeCount - b.maybeCount ||
        (order.get(a.optionId) ?? 0) - (order.get(b.optionId) ?? 0),
    );
}

/**
 * The calendar auto-default for one proposed option: given its concrete
 * interval and the viewer's already-accepted busy blocks, suggest a starting
 * stance — No (0) if it overlaps something they've committed to, Free (2) if
 * clear. Returns null when the option carries no concrete time (nothing to
 * check against), so the UI leaves it blank for a manual answer.
 */
export function suggestAvail(
  startMs: number | null,
  endMs: number | null,
  busy: BusyInterval[],
): Avail | null {
  if (startMs == null || endMs == null || !(endMs > startMs)) return null;
  for (const b of busy) {
    if (overlaps(startMs, endMs, b.startMs, b.endMs)) return 0;
  }
  return 2;
}
