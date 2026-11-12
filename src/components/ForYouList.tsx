"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock, Images, Loader2, Megaphone, MessageSquare, Users } from "lucide-react";
import { updateCardStatus } from "@/app/feed-actions";
import { setTeamAnswer } from "@/app/team-actions";
import { InviteNoteThread } from "./InviteNoteThread";
import type { DigestCardData } from "@/lib/types";

const card = "rounded-[20px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]";
type Invite = Extract<DigestCardData, { type: "social_invite" }>;

/**
 * "For you": the short, finite list of things that came TO you — invites to
 * answer, changes to your plans, announcements, photos. Answer or clear each
 * one and it's gone.
 */
export function ForYouList({ cards, tz }: { cards: DigestCardData[]; tz: string }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = cards.filter((c) => !gone.has(c.id));
  const hide = (id: string) => setGone((s) => new Set(s).add(id));

  if (shown.length === 0) {
    return (
      <p className="rounded-2xl bg-green-100 px-4 py-3.5 text-[14px] font-semibold text-green-800">
        You&rsquo;re caught up — nothing waiting on you.
      </p>
    );
  }
  return (
    <ul className="space-y-2.5">
      {shown.map((c) => (
        <li key={c.id}>
          {c.type === "social_invite" ? <InviteRow c={c} tz={tz} onDone={() => hide(c.id)} /> : <NoteRow c={c} onDone={() => hide(c.id)} />}
        </li>
      ))}
    </ul>
  );
}

function DateTile({ iso, tz }: { iso?: string; tz: string }) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) {
    return (
      <span className="flex h-[50px] w-[46px] shrink-0 items-center justify-center rounded-[13px] bg-neutral-200">
        <CalendarClock className="h-5 w-5 text-neutral-600" />
      </span>
    );
  }
  return (
    <span className="flex h-[50px] w-[46px] shrink-0 flex-col items-center justify-center rounded-[13px] bg-neutral-200">
      <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-600">{d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz })}</span>
      <span className="text-[18px] font-bold leading-none text-neutral-900">{d.toLocaleDateString("en-US", { day: "numeric", timeZone: tz })}</span>
    </span>
  );
}

function InviteRow({ c, tz, onDone }: { c: Invite; tz: string; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const team = !!c.teamId;

  async function answer(kind: "in" | "maybe" | "out") {
    if (busy) return;
    setBusy(kind);
    setNote(null);
    if (team) {
      const res = await setTeamAnswer(c.id, kind);
      setBusy(null);
      if (!res.ok) return setNote(res.error ?? "Couldn't save.");
    } else {
      const res = await updateCardStatus(c.id, kind === "in" ? "accepted" : "dismissed");
      setBusy(null);
      if (res?.state === "full") return setNote("This plan just filled up.");
      if (res?.state === "waitlisted") {
        // Stay visible so they see where they stand (a refresh would drop the card).
        return setNote(`It's full — you're #${res.position ?? "?"} on the waitlist.`);
      }
    }
    router.refresh();
    onDone();
  }

  const headline = c.teamName
    ? `${c.teamName} · ${c.teamKind === "practice" ? "practice" : "game"}`
    : `${c.senderName} invited you`;
  const meta = [c.eventTime, c.location].filter(Boolean).join(" · ");
  const short = team && c.teamIn !== undefined && c.teamMin ? c.teamIn < c.teamMin : false;
  const btn = "flex h-11 items-center justify-center rounded-xl text-[14px] transition disabled:opacity-60";

  return (
    <article className={`${card} space-y-3 p-3.5`}>
      <Link href={c.eventId ? `/event/${c.eventId}` : "/calendar"} className="flex items-center gap-3">
        <DateTile iso={c.startsAt} tz={tz} />
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-semibold text-fuchsia-800">{headline}</span>
          <span className="block truncate text-[16px] font-bold text-neutral-900">{c.eventTitle}</span>
          {meta && <span className="block truncate text-[13px] text-neutral-500">{meta}</span>}
        </span>
      </Link>
      {c.note && <p className="line-clamp-2 text-[14px] leading-snug text-neutral-700">{c.note}</p>}
      {team && c.teamIn !== undefined && (
        <p className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold ${short ? "bg-fuchsia-100 text-fuchsia-900" : "bg-green-100 text-green-800"}`}>
          <Users className="h-4 w-4 shrink-0" />
          {c.teamMin ? (short ? `${c.teamIn} of ${c.teamMin} in — the team needs you` : `${c.teamIn} in — enough to play`) : `${c.teamIn} in so far`}
        </p>
      )}
      {c.privateNote && c.eventId && c.senderId && <InviteNoteThread eventId={c.eventId} otherId={c.senderId} otherName={c.senderName} />}
      <div className={`grid gap-2 ${team ? "grid-cols-[1.4fr_1fr_1fr]" : "grid-cols-[1fr_1.3fr]"}`}>
        {team ? (
          <>
            <button type="button" disabled={!!busy} onClick={() => answer("in")} className={`${btn} bg-fuchsia-700 font-bold text-white`}>
              {busy === "in" ? <Loader2 className="h-4 w-4 animate-spin" /> : "I'm in"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => answer("maybe")} className={`${btn} border border-neutral-200 bg-white font-semibold text-neutral-900`}>
              {busy === "maybe" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Maybe"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => answer("out")} className={`${btn} border border-neutral-200 bg-white font-semibold text-neutral-900`}>
              {busy === "out" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Out"}
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={!!busy} onClick={() => answer("out")} className={`${btn} border border-neutral-200 bg-white font-semibold text-neutral-900`}>
              {busy === "out" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Can't go"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => answer("in")} className={`${btn} bg-fuchsia-700 font-bold text-white`}>
              {busy === "in" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Going"}
            </button>
          </>
        )}
      </div>
      {note && <p className="text-[13px] font-medium text-neutral-600">{note}</p>}
    </article>
  );
}

/** Everything that isn't an invite: one line, a link to where it lives, and "Got it". */
function NoteRow({ c, onDone }: { c: Exclude<DigestCardData, Invite>; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  let icon = <Clock className="h-[17px] w-[17px] text-green-700" />;
  let tone = "bg-green-100";
  let title = "";
  let sub = "";
  let href: string | null = null;
  let body: string | null = null;

  switch (c.type) {
    case "event_update":
      href = c.eventId ? `/event/${c.eventId}` : null;
      if (c.announce) {
        icon = <Megaphone className="h-[17px] w-[17px] text-fuchsia-800" />;
        tone = "bg-fuchsia-100";
        title = `${c.hostName} · announcement`;
        sub = c.eventTitle;
        body = c.changeSummary ?? null;
      } else if (c.nudge) {
        icon = <Users className="h-[17px] w-[17px] text-fuchsia-800" />;
        tone = "bg-fuchsia-100";
        title = `Are you in? ${c.eventTitle}`;
        sub = [c.hostName, c.eventTime].filter(Boolean).join(" · ");
      } else {
        title = `${c.eventTitle}: ${c.changeSummary ?? "details updated"}`;
        sub = [c.hostName, c.eventTime, c.location].filter(Boolean).join(" · ");
      }
      break;
    case "social_post":
      icon = <Images className="h-[17px] w-[17px] text-amber-700" />;
      tone = "bg-amber-100";
      title = `${c.senderName} added photos`;
      sub = c.eventTitle ?? "";
      break;
    case "time_poll":
      icon = <CalendarClock className="h-[17px] w-[17px] text-violet-700" />;
      tone = "bg-violet-100";
      title = `${c.senderName} is finding a time`;
      sub = c.title;
      href = `/poll/${c.pollId}`;
      break;
    case "social_ping":
      icon = <MessageSquare className="h-[17px] w-[17px] text-neutral-700" />;
      tone = "bg-neutral-200";
      title = `${c.senderName} sent a note`;
      body = c.message;
      break;
    default:
      return null;
  }

  async function clear() {
    setBusy(true);
    try {
      await updateCardStatus(c.id, "dismissed");
      onDone();
    } catch {
      setBusy(false);
    }
  }
  const text = (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[14px] font-bold text-neutral-900">{title}</span>
      {sub && <span className="block truncate text-[13px] text-neutral-500">{sub}</span>}
    </span>
  );
  return (
    <article className={`${card} space-y-2 rounded-2xl p-3`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
        {href ? (
          <Link href={href} className="flex min-w-0 flex-1">
            {text}
          </Link>
        ) : (
          text
        )}
        <button
          type="button"
          onClick={clear}
          disabled={busy}
          className="flex h-10 shrink-0 items-center rounded-xl border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-900 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Got it"}
        </button>
      </div>
      {body && <p className="whitespace-pre-wrap rounded-xl bg-linen px-3 py-2.5 text-[14px] font-medium leading-snug text-neutral-900">{body}</p>}
    </article>
  );
}
