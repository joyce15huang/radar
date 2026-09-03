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
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Guests
        </h2>
        {canInvite && (
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <UserPlus className="h-3.5 w-3.5" /> Invite friends
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
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
