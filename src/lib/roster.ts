// Shared attendee/roster shapes for the Calendar guest-faces UI.
// Populated server-side (see app/roster-actions.ts) and rendered by GuestFaces.

export type AttendeeStatus = "going" | "invited" | "declined";

export interface Attendee {
  /** The attendee's user id. */
  id: string;
  /** Display handle: "@username" when set, else a name from their email. */
  name: string;
  status: AttendeeStatus;
  /** The event host (shown with an accent + crown). */
  isHost: boolean;
  /** Whether this attendee has tapped "I've paid" (only meaningful if hasFee). */
  feePaid: boolean;
  /** Their Instagram handle (no @), from their public profile. */
  instagram?: string;
  /** Display name from their profile, when set. */
  displayName?: string;
}

export interface EventRoster {
  /** Confirmed attendees (RSVP'd "Going"), host first. */
  going: Attendee[];
  /** Invited but not yet responded (pending). */
  invited: Attendee[];
  goingCount: number;
  invitedCount: number;
  /** Said "Can't go". */
  declined: Attendee[];
  /** The event charges a participation fee. */
  hasFee: boolean;
  /** How many attendees have confirmed payment. */
  paidCount: number;
}
