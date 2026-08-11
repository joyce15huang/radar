// Countdown/window helpers for the Opportunity Engine's "Time" axis.
// Pure functions so both the deck card and the Calendar row render the same
// label. Deadlines are ISO strings stored in a card's content (expiresAt/opensAt).

export type WindowUrgency =
  | "closed" // the window has passed
  | "urgent" // closes within ~2 days
  | "soon" // closes within ~2 weeks
  | "later" // closes further out
  | "upcoming" // hasn't opened yet
  | "none"; // no machine-readable date

export interface WindowStatus {
  label: string;
  urgency: WindowUrgency;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

function parse(iso?: string): number {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? NaN : t;
}

function humanIn(ms: number): string {
  if (ms < HOUR) return "within the hour";
  if (ms < DAY) {
    const h = Math.max(1, Math.round(ms / HOUR));
    return `in ${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.ceil(ms / DAY);
  return `in ${d} day${d === 1 ? "" : "s"}`;
}

/**
 * Resolve a human window label + urgency. `now` is injectable for testing;
 * defaults to the current time. Priority: not-yet-open → closing countdown →
 * free-text windowLabel → none.
 */
export function windowStatus(
  opts: { opensAt?: string; expiresAt?: string; windowLabel?: string },
  now: number = Date.now(),
): WindowStatus {
  const opens = parse(opts.opensAt);
  const expires = parse(opts.expiresAt);

  if (!Number.isNaN(opens) && opens > now) {
    return { label: `Opens ${humanIn(opens - now)}`, urgency: "upcoming" };
  }

  if (!Number.isNaN(expires)) {
    const left = expires - now;
    if (left <= 0) return { label: "Window closed", urgency: "closed" };
    const urgency: WindowUrgency =
      left <= 2 * DAY ? "urgent" : left <= 14 * DAY ? "soon" : "later";
    return { label: `Closes ${humanIn(left)}`, urgency };
  }

  if (opts.windowLabel?.trim()) {
    return { label: opts.windowLabel.trim(), urgency: "none" };
  }

  return { label: "", urgency: "none" };
}

/** Sort key: soonest-closing first; undated windows last. */
export function windowSortKey(opts: { expiresAt?: string }): number {
  const t = parse(opts.expiresAt);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}
