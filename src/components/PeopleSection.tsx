"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { GuestList } from "./GuestList";
import { InviteComposer } from "./InviteComposer";

/** The event page's Guests area: header (counts + Invite) and the guest list. */
export function PeopleSection({
  eventId,
  eventTitle,
  canInvite,
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
