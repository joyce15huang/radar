import { redirect } from "next/navigation";
import { TabNav } from "@/components/TabNav";
import { InboxClient } from "@/components/InboxClient";
import { getActor } from "@/lib/actor";
import { listInboxInvites } from "@/app/inbox-actions";
import { listIncomingRequests } from "@/app/friends-actions";

/** Notifications: event invites waiting on you, and friend requests. */
export default async function InboxPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/inbox");
  const [invites, requests] = await Promise.all([listInboxInvites(), listIncomingRequests()]);

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
        <TabNav />
        <header className="mb-5">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900">Inbox</h1>
        </header>
        <InboxClient invites={invites} requests={requests} />
      </div>
    </main>
  );
}
