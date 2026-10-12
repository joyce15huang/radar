/**
 * Layer 1 of plan-text parsing: plain code, no AI. Runs BEFORE any model call
 * and bounces input that's too long or clearly isn't plans (someone steering
 * the model, or asking it to write/explain something). Deliberately lenient on
 * short text — "bball" or "lunch w sam" must always get through; the model
 * call (layer 2) makes the final is-this-a-plan call.
 */

export const MAX_EVENT_TEXT = 100;

export type GuardResult = { ok: true; text: string } | { ok: false; reason: string };

export const NOT_A_PLAN_MESSAGE = "That doesn't look like a plan — try something like “fri lunch with Sam, 6p bball”.";
export const TOO_LONG_MESSAGE = `Too long — add the rest in another entry (${MAX_EVENT_TEXT} characters max).`;

// Someone talking to the model instead of describing plans.
const STEERING =
  /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(instructions?|prompt|rules|above|previous)\b|\bsystem prompt\b|\byou are (now )?(an? |my )?(ai|assistant|chatgpt|claude|model|bot)\b|\b(act|pretend|role-?play) as\b|\bjailbreak\b|\bdeveloper mode\b/i;

// Asking for some other task.
const OTHER_TASK =
  /^(please\s+)?(explain|summari[sz]e|translate|tell me|what (is|are)|why|how (do|does|to|can)|generate|compose|give me|solve|answer)\b/i;

// Anything that smells like a when, a meal, or a typical plan.
const TIME_SIGNAL =
  /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?s?\b|\b(today|tonight|tmrw|tmr|tomorrow|weekend|wknd|next|this|morning|afternoon|evening|night|noon|midnight)\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*\d|\b\d{1,2}\s*(:\d{2})?\s*(a|p|am|pm)\b|\b\d{1,2}[/-]\d{1,2}\b|\b\d{1,2}(st|nd|rd|th)\b|\b(at|@)\s*\d|\b(breakfast|brunch|lunch|dinner|drinks|coffee|party|bday|birthday|game|practice|class|meeting|appt|appointment|flight|trip|concert|show|movie|hike|run|gym|bbq|potluck)\b/i;

export function screenEventText(raw: string): GuardResult {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "Type a plan, like “fri lunch with Sam”." };
  if (text.length > MAX_EVENT_TEXT) return { ok: false, reason: TOO_LONG_MESSAGE };
  if (/```|<\/?\w+[^>]*>|\{\s*"/.test(text)) return { ok: false, reason: NOT_A_PLAN_MESSAGE };
  if (STEERING.test(text)) return { ok: false, reason: NOT_A_PLAN_MESSAGE };
  if (OTHER_TASK.test(text) && !TIME_SIGNAL.test(text)) return { ok: false, reason: NOT_A_PLAN_MESSAGE };
  return { ok: true, text };
}

/** Lowercase, drop punctuation, squash spaces — for spotting repeats. */
export function normalizePlanText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-set overlap (Jaccard), 0–1. */
export function similarity(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}
