// Read-only server functions the browser may call through /api/read.
//
// Why not call them as server actions? Next.js runs server actions one at a
// time, in the same queue as page navigations. A badge or roster fetched on
// mount as a server action makes the next tap wait for it. A plain fetch to a
// route handler runs alongside, so taps stay instant. Every function here
// checks who's signed in itself (getActor), exactly as before.
import { chatsBadge, markChatRead } from "@/app/chat-list-actions";
import { getEventRoster } from "@/app/roster-actions";
import { getChat, getPrivateWith } from "@/app/comment-actions";
import { getLinkPreview } from "@/app/link-preview-actions";
import { listRides } from "@/app/carpool-actions";
import { getPostSocial } from "@/app/photo-actions";
import { planGuestCount } from "@/app/event-actions";

export const READS = {
  chatsBadge,
  markChatRead,
  getEventRoster,
  getChat,
  getPrivateWith,
  getLinkPreview,
  listRides,
  getPostSocial,
  planGuestCount,
};
export type ReadName = keyof typeof READS;
