"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { GuestFaces } from "./GuestFaces";
import { InviteComposer } from "./InviteComposer";

/** The event page's Guests area: the section header (with the Invite control
 *  aligned to it) + the roster, kept together in one place. */
export function PeopleSection({
  eventId,
  eventTitle,
  canInvite,
  isHost,
  allowReinvite,
}: {
  eventId: string;
  eventTitle: string;
  canInvite: boolean;
  isHost: boolean;
  allowReinvite: boolean;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);

  return (
    <section className="space-y-2">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-neutral-900">Guests</h2>
        {canInvite && (
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50"
          >
            <UserPlus className="h-4 w-4" /> Invite
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <GuestFaces eventId={eventId} />
      </div>

      {inviting && (
        <InviteComposer
          eventTitle={eventTitle}
          target={{ kind: "event", eventId }}
          canSetReinvite={isHost}
          initialAllowReinvite={allowReinvite}
          onClose={() => {
            setInviting(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
