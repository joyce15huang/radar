import Anthropic from "@anthropic-ai/sdk";

const PARSE_MODEL = "claude-haiku-4-5";

export interface ParsedEvent {
  title: string;
  /** Human-friendly display string, e.g. "Sat, Aug 9 · 7:00 PM" (time omitted if unknown). */
  when: string;
  /** Best-effort ISO 8601 with offset, or null if the parser couldn't resolve one. */
  startsAt: string | null;
  /** Whether a specific time-of-day was stated/implied (vs an all-day event). */
  hasTime: boolean;
  location?: string;
  note?: string;
}

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY.");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/** A one-line "now" context so the model can resolve relative dates/times. */
export function nowContext(tz = "America/Los_Angeles"): string {
  const now = new Date();
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  return `Current date/time: ${s} (timezone ${tz}).`;
}

interface RawEvent {
  title?: string;
  when?: string;
  startsAt?: string | null;
  hasTime?: boolean;
  location?: string | null;
  note?: string | null;
}

/**
 * The dedicated schedule-parsing engine. Turns casual free text into one or more
 * structured events, resolving relative dates/times against `nowContext`.
 *
 * NOTE: `when` is only a first-pass label — callers should re-derive the display
 * label from `startsAt` (see lib/localDateTime.formatWhen) so the weekday shown
 * always matches the machine date. The date itself is meant to be confirmed by
 * the user on a calendar picker.
 */
export async function parseEvents(
  text: string,
  opts: { nowContext: string; multiple: boolean },
): Promise<ParsedEvent[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const guidance = opts.multiple
    ? "The text may describe SEVERAL events (comma/line separated). Return one entry per distinct event, in the order given."
    : "The text describes ONE event. Return exactly one entry (the primary event).";

  const msg = await anthropic().messages.create({
    model: PARSE_MODEL,
    max_tokens: 1024,
    system: `You convert casual, shorthand event text into structured calendar entries.
${opts.nowContext}
Resolve relative references ("fri", "this Saturday", "tmrw", "6p", "lunch") into concrete values:
- "startsAt": ISO 8601 WITH the timezone offset of the current timezone above, for the specific date. This is the source of truth. Use the correct calendar date for the referenced weekday relative to the current date. If a time is stated/implied ("lunch" ≈ 12:00, "dinner" ≈ 19:00, "6p" = 18:00) use it; otherwise use 09:00 local. If you cannot resolve a specific date, null.
- "hasTime": true only if a specific time-of-day was stated or strongly implied; false for a day-only event.
- "when": a short human label like "Sat, Aug 9 · 7:00 PM" that MUST match the weekday of "startsAt" exactly. Double-check the weekday against the date before answering.
- "location": a place if mentioned (e.g. "at Google" → "Google"), else null.
- "note": ONLY an extra detail not already conveyed by the title, the date/time, or the location — e.g. "with Cedric", "bring snacks". NEVER restate timing (never "after work", "tonight", "this weekend", "in the evening") and never repeat the location. If there is no such leftover detail, null.
Keep titles concise. ${guidance}`,
    tools: [
      {
        name: "emit_events",
        description: "Return the parsed calendar events.",
        input_schema: {
          type: "object",
          properties: {
            events: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  when: { type: "string" },
                  startsAt: { type: ["string", "null"] },
                  hasTime: { type: "boolean" },
                  location: { type: ["string", "null"] },
                  note: { type: ["string", "null"] },
                },
                required: ["title", "when", "startsAt", "hasTime", "location", "note"],
              },
            },
          },
          required: ["events"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "emit_events" },
    messages: [{ role: "user", content: trimmed }],
  });

  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return [];
  const raw = (block.input as { events?: RawEvent[] }).events ?? [];

  const events: ParsedEvent[] = raw
    .filter((e) => e.title && e.when)
    .map((e) => ({
      title: String(e.title),
      when: String(e.when),
      startsAt: e.startsAt ?? null,
      hasTime: Boolean(e.hasTime),
      location: e.location ?? undefined,
      note: e.note ?? undefined,
    }));

  return opts.multiple ? events : events.slice(0, 1);
}
