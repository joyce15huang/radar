"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AtSign, Check, ChevronDown, Link2, Loader2 } from "lucide-react";
import { getEventRoster } from "@/app/roster-actions";
import { getInviteLink } from "@/app/invite-link-actions";
import type { Attendee, EventRoster } from "@/lib/roster";

const TONES = [
  "bg-fuchsia-700 text-white",
  "bg-amber-500 text-neutral-900",
  "bg-sky-500 text-neutral-900",
  "bg-amber-300 text-neutral-900",
  "bg-violet-600 text-white",
];
const COLLAPSED = 5;

const STATUS: Record<Attendee["status"], { label: string; cls: string }> = {
  going: { label: "Going", cls: "bg-sky-100 text-sky-800" },
  invited: { label: "Invited", cls: "bg-neutral-100 text-neutral-600" },
  declined: { label: "Can't go", cls: "bg-transparent text-neutral-400" },
};

/** The event's guest list: one tappable row per person with their status and IG handle. */
export function GuestList({
  eventId,
  canInvite,
  onCounts,
}: {
  eventId: string;
  canInvite: boolean;
  onCounts?: (going: number, invited: number) => void;
}) {
  const [roster, setRoster] = useState<EventRoster | null | "loading">("loading");
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    getEventRoster(eventId)
      .then((r) => {
        if (!live) return;
        setRoster(r);
        if (r) onCounts?.(r.goingCount, r.invitedCount);
      })
      .catch(() => live && setRoster(null));
    return () => {
      live = false;
    };
  }, [eventId, onCounts]);

  if (roster === "loading") {
    return (
      <div className="space-y-3 p-4" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="h-[38px] w-[38px] animate-pulse rounded-full bg-neutral-200" />
            <span className="h-3 w-32 animate-pulse rounded bg-neutral-200" />
          </div>
        ))}
      </div>
    );
  }

  const people = roster ? [...roster.going, ...roster.invited, ...roster.declined] : [];
  const visible = all ? people : people.slice(0, COLLAPSED);

  return (
    <div className="divide-y divide-neutral-100">
      {visible.map((p, i) => {
        const s = STATUS[p.status];
        const handle = p.name.startsWith("@") ? p.name : "";
        const title = p.displayName || p.name;

        return (
          <div key={p.id} className="flex items-center gap-3 py-3 pl-4 pr-3.5">
            <Link
              href={`/u/${p.id}`}
              className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[15px] font-bold uppercase ${TONES[i % TONES.length]} ${
                p.status === "declined" ? "opacity-50" : ""
              }`}
            >
              {title.replace(/^@/, "").slice(0, 1)}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/u/${p.id}`} className="block truncate text-[15px] font-semibold text-neutral-900 hover:underline">
                {title}
                {p.displayName && handle && <span className="font-medium text-neutral-500"> {handle}</span>}
              </Link>
              {p.instagram && (
                <a
                  href={`https://instagram.com/${p.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-0.5 truncate text-[12px] font-medium text-neutral-500 hover:text-neutral-900"
                >
                  <AtSign className="h-3 w-3 shrink-0" />
                  {p.instagram}
                </a>
              )}
            </div>
            <span className={`inline-flex h-[26px] shrink-0 items-center rounded-lg px-2.5 text-[12px] font-bold ${s.cls}`}>{s.label}</span>
          </div>
        );
      })}

      {people.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="flex h-12 w-full items-center justify-between px-4 text-sm font-semibold text-neutral-700"
        >
          {all ? "Show fewer" : `See all ${people.length} guests`}
          <ChevronDown className={`h-4 w-4 text-neutral-400 transition ${all ? "rotate-180" : ""}`} />
        </button>
      )}

      {canInvite && <InviteLinkRow eventId={eventId} />}
    </div>
  );
}

function InviteLinkRow({ eventId }: { eventId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "copied">("idle");

  useEffect(() => {
    let live = true;
    getInviteLink(eventId)
      .then((r) => live && r.ok && r.url && setUrl(r.url))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [eventId]);

  async function copy() {
    let link = url;
    if (!link) {
      setState("loading");
      const r = await getInviteLink(eventId);
      link = r.url ?? null;
      setUrl(link);
      setState("idle");
    }
    if (!link) return;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) await navigator.share({ url: link });
      else await navigator.clipboard.writeText(link);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      /* share sheet dismissed */
    }
  }

  return (
    <div className="flex items-center gap-3 py-2.5 pl-4 pr-2.5">
      <Link2 className="h-4 w-4 shrink-0 text-neutral-500" />
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-neutral-600">
        {url ? url.replace(/^https?:\/\//, "") : "Invite link"}
      </span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[10px] bg-neutral-100 px-3 text-[13px] font-semibold text-neutral-900 transition hover:bg-neutral-200"
      >
        {state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "copied" ? <Check className="h-3.5 w-3.5" /> : null}
        {state === "copied" ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
