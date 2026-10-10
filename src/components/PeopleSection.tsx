"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Users } from "lucide-react";
import { toggleReinvite } from "@/app/event-actions";
import { GuestList } from "./GuestList";
import { InviteComposer } from "./InviteComposer";

/** The event page's Guests area: header (counts + Invite) and the guest list. */
export function PeopleSection({
  eventId,
  eventTitle,
  canInvite,
  isHost = false,
  allowReinvite = false,
}: {
  eventId: string;
  eventTitle: string;
  canInvite: boolean;
  isHost?: boolean;
  allowReinvite?: boolean;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [rev, setRev] = useState(0);
  const [counts, setCounts] = useState<{ going: number; invited: number } | null>(null);
  const onCounts = useCallback((going: number, invited: number) => setCounts({ going, invited }), []);
  const [reinvite, setReinvite] = useState(allowReinvite);
  const [savingReinvite, setSavingReinvite] = useState(false);

  async function flipReinvite() {
    if (savingReinvite) return;
    const next = !reinvite;
    setReinvite(next);
    setSavingReinvite(true);
    const res = await toggleReinvite({ eventId, allow: next });
    setSavingReinvite(false);
    if (!res.ok) setReinvite(!next);
  }

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">
          Guests
          {counts && (
            <span className="ml-1.5 text-[14px] font-medium text-neutral-500">
              {counts.going} going{counts.invited > 0 ? ` · ${counts.invited} invited` : ""}
            </span>
          )}
        </h2>
        {canInvite && (
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="inline-flex h-[38px] items-center gap-1.5 rounded-xl bg-fuchsia-700 px-3.5 text-sm font-semibold text-white transition hover:bg-fuchsia-800"
          >
            <Send className="h-4 w-4" /> Invite
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-[18px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
        <GuestList key={rev} eventId={eventId} canInvite={canInvite} onCounts={onCounts} />
        {isHost && (
          <button
            type="button"
            role="switch"
            aria-checked={reinvite}
            onClick={flipReinvite}
            className="flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-3 text-left transition hover:bg-neutral-50"
          >
            <Users className="h-[17px] w-[17px] shrink-0 text-neutral-500" />
            <span className="flex-1 text-[14px] font-medium text-neutral-700">Guests can invite others</span>
            <span
              className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${reinvite ? "bg-neutral-900" : "bg-neutral-300"}`}
            >
              <span
                className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${reinvite ? "left-[21px]" : "left-[3px]"}`}
              />
            </span>
          </button>
        )}
      </div>

      {inviting && (
        <InviteComposer
          eventTitle={eventTitle}
          target={{ kind: "event", eventId }}
          onClose={() => {
            setInviting(false);
            setRev((n) => n + 1);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
