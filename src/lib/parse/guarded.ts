import { parseEventsDetailed, nowContext, SEASON_TEXT_CAP, type ParsedEvent, type SeasonParseOpts } from "./schedule";
import { screenEventText, screenSeasonText, normalizePlanText, NOT_A_PLAN_MESSAGE, NOT_A_SCHEDULE } from "./guard";
import { checkParseUsage, recordParseUsage, RATE_LIMITED_MESSAGE, REPEAT_MESSAGE } from "./usage";

export type GuardedParse = { ok: true; events: ParsedEvent[] } | { ok: false; error: string };

/**
 * Free-text plans → events, behind both guardrails:
 *  layer 1 (code): length, steering/other-task text, hourly limit, repeats;
 *          an identical recent submission reuses its result with no model call.
 *  layer 2 (model): is-this-a-plan flag in the same parse call + clipped output.
 */
export async function guardedParse(
  userId: string,
  text: string,
  opts: { tz: string; multiple: boolean; season?: SeasonParseOpts; list?: boolean },
): Promise<GuardedParse> {
  const long = !!opts.season || !!opts.list;
  const screened = long ? screenSeasonText(text, SEASON_TEXT_CAP) : screenEventText(text);
  if (!screened.ok) return { ok: false, error: screened.reason };

  // Season results are keyed separately so a cached plan parse is never reused for one.
  const norm = (opts.season ? "season:" : opts.list ? "list:" : "") + normalizePlanText(screened.text);
  const usage = await checkParseUsage(userId, norm);
  if (usage.kind === "cached") return { ok: true, events: usage.events };
  if (usage.kind === "limited") return { ok: false, error: RATE_LIMITED_MESSAGE };
  if (usage.kind === "repeat") return { ok: false, error: REPEAT_MESSAGE };

  let result: { isPlan: boolean; events: ParsedEvent[] };
  try {
    result = await parseEventsDetailed(screened.text, {
      nowContext: nowContext(opts.tz),
      multiple: opts.multiple,
      season: opts.season,
      list: opts.list,
    });
  } catch (e) {
    console.error("[parse] model call failed", e);
    return { ok: false, error: "Couldn't read that right now — try again in a moment." };
  }
  await recordParseUsage(userId, norm, result.isPlan ? result.events : null);
  if (!result.isPlan || result.events.length === 0)
    return {
      ok: false,
      error: opts.season ? NOT_A_SCHEDULE : opts.list ? "Couldn't find any dates in that — add them below." : NOT_A_PLAN_MESSAGE,
    };
  return { ok: true, events: result.events };
}
