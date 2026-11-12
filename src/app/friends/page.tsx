import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getActor } from "@/lib/actor";
import { FriendsClient } from "@/components/FriendsClient";
import { listFriends, listIncomingRequests } from "@/app/friends-actions";

/** Your friends: add by username, answer requests, see the list. */
export default async function FriendsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/friends");
  const [friends, requests] = await Promise.all([listFriends(), listIncomingRequests()]);
  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
        <div className="mb-2 flex h-12 items-center">
          <Link
            href="/me"
            aria-label="Back to Profile"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-200/60"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </Link>
        </div>
        <h1 className="mb-5 text-[30px] font-bold leading-tight tracking-tight text-neutral-900">Friends</h1>
        <FriendsClient friends={friends} requests={requests} />
      </div>
    </main>
  );
}
