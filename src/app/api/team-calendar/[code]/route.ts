import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Read-only iCalendar feed for a team (subscribe in Google / Apple Calendar).
 * Keyed by the team's join code — anyone who has that link can already join, so
 * the feed reveals nothing more. Games + practices from 30 days back onward.
 */
export const dynamic = "force-dynamic";

const DEFAULT_MINUTES = 90;

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.replace(/\.ics$/i, "");
  if (!/^[A-Za-z0-9]{6,16}$/.test(code)) return new Response("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: team, error } = await admin.from("teams").select("id, name").eq("invite_code", code).maybeSingle();
  if (error || !team) return new Response("Not found", { status: 404 });

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: events } = await admin
    .from("events")
    .select("id, title, starts_at, location, kind, opponent, home_away, all_day")
    .eq("team_id", team.id)
    .is("canceled_at", null)
    .not("starts_at", "is", null)
    .gte("starts_at", since)
    .order("starts_at", { ascending: true })
    .limit(200);

  const stamp = icsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Blip Club//Teams//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(team.name as string)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    "X-PUBLISHED-TTL:PT2H",
  ];
  for (const e of events ?? []) {
    const start = new Date(e.starts_at as string);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + DEFAULT_MINUTES * 60_000);
    // Date-only games: an all-day entry on that local day (start stored as 09:00 local).
    const allDay = !!e.all_day;
    const summary = `${team.name}: ${(e.title as string) || (e.kind === "practice" ? "Practice" : "Game")}`;
    const desc = [e.kind === "practice" ? "Practice" : "Game", e.home_away === "home" ? "Home" : e.home_away === "away" ? "Away" : null]
      .filter(Boolean)
      .join(" · ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@digest-teams`,
      `DTSTAMP:${stamp}`,
      ...(allDay
        ? [`DTSTART;VALUE=DATE:${icsDay(start)}`, `DTEND;VALUE=DATE:${icsDay(new Date(start.getTime() + 86_400_000))}`]
        : [`DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`]),
      `SUMMARY:${esc(summary)}`,
      ...(e.location ? [`LOCATION:${esc(e.location as string)}`] : []),
      ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="team.ics"`,
      "Cache-Control": "public, max-age=900",
    },
  });
}

/** 20261013T030000Z */
function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 20261013 — the UTC day of a 09:00-local sentinel equals its local day for any US/EU zone. */
function icsDay(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Escape TEXT values per RFC 5545. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}
