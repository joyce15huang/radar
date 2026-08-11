// Shared attendee/roster shapes for the Calendar guest-faces UI.
// Populated server-side (see app/roster-actions.ts) and rendered by GuestFaces.

export type AttendeeStatus = "going" | "invited";

export interface Attendee {
  /** The attendee's user id. */
  id: string;
  /** Display handle: "@username" when set, else a name from their email. */
  name: string;
  status: AttendeeStatus;
  /** The event host (shown with an accent + crown). */
  isHost: boolean;
}

export interface EventRoster {
  /** Confirmed attendees (RSVP'd "Going"), host first. */
  going: Attendee[];
  /** Invited but not yet responded (pending). */
  invited: Attendee[];
  goingCount: number;
  invitedCount: number;
}
