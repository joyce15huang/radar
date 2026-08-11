// Guard against a parsed "note"/"details" that merely restates what the row
// already shows (its time or location). Keeps event cards concise — e.g. a note
// of "after work" is dropped because the time already conveys it, while a real
// detail like "bring snacks" is always kept.

const TIMEY = new Set([
  "after work",
  "before work",
  "after class",
  "after school",
  "tonight",
  "today",
  "tomorrow",
  "later",
  "all day",
  "noon",
  "midday",
  "midnight",
  "this morning",
  "this afternoon",
  "this evening",
  "this weekend",
  "in the morning",
  "in the afternoon",
  "in the evening",
  "morning",
  "afternoon",
  "evening",
]);

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.,!;:]+$/g, "")
    .trim();
}

/**
 * True when `note` adds nothing beyond the fields already shown (the time label
 * or location), so the UI should hide it. Deliberately conservative: it only
 * drops pure timing phrases or an exact echo of the location/time — any note
 * that carries real detail is kept.
 */
export function isRedundantNote(
  note: string | undefined | null,
  context: { time?: string; location?: string } = {},
): boolean {
  if (!note) return true;
  const n = norm(note);
  if (!n) return true;
  if (TIMEY.has(n)) return true;

  const loc = context.location ? norm(context.location) : "";
  if (loc && (n === loc || n === `at ${loc}`)) return true;

  const time = context.time ? norm(context.time) : "";
  if (time && n.length >= 3 && time.includes(n)) return true;

  return false;
}
