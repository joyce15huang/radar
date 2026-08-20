import { redirect } from "next/navigation";
import { AccountBar } from "@/components/AccountBar";
import { TabNav } from "@/components/TabNav";
import { FriendsClient } from "@/components/FriendsClient";
import { getActor } from "@/lib/actor";
import type { FriendEntry } from "@/lib/friends";

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
}

interface ProfileLite {
  username: string | null;
  email: string | null;
}

/** Display name: the @handle if set, else the email local-part. */
function displayName(p: ProfileLite | undefined): string {
  if (p?.username) return p.username;
  const local = (p?.email ?? "").split("@")[0];
  return local || "Someone";
}

export default async function FriendsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { supabase, actorId } = actor;

  const { data: relRows, error } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status, created_at")
    .or(`requester_id.eq.${actorId},addressee_id.eq.${actorId}`)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false });

  const rels = (relRows ?? []) as FriendshipRow[];

  // Resolve each "other" user's username + email in one query.
  const otherIds = Array.from(
    new Set(rels.map((r) => (r.requester_id === actorId ? r.addressee_id : r.requester_id))),
  );
  const profileById = new Map<string, ProfileLite>();
  if (otherIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, email")
      .in("id", otherIds);
    (profs ?? []).forEach((p) =>
      profileById.set(p.id as string, {
        username: (p.username as string) ?? null,
        email: (p.email as string) ?? null,
      }),
    );
  }

  const entryFor = (r: FriendshipRow): FriendEntry => {
    const otherId = r.requester_id === actorId ? r.addressee_id : r.requester_id;
    const p = profileById.get(otherId);
    return {
      friendshipId: r.id,
      userId: otherId,
      username: p?.username ?? "",
      email: p?.email ?? "",
      name: displayName(p),
    };
  };

  const friends: FriendEntry[] = [];
  const incoming: FriendEntry[] = [];
  const outgoing: FriendEntry[] = [];
  for (const r of rels) {
    if (r.status === "accepted") friends.push(entryFor(r));
    else if (r.requester_id === actorId) outgoing.push(entryFor(r));
    else incoming.push(entryFor(r));
  }

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <AccountBar email={actor.userEmail ?? undefined} link={{ href: "/profile", label: "Settings" }} />
        <TabNav />
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Friends
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Add people by their username. Once you&rsquo;re connected, invites and event
            photos reach each other&rsquo;s decks &mdash; no notifications, no noise.
          </p>
        </header>

        {error ? (
          <SchemaNotice message={error.message} />
        ) : (
          <FriendsClient friends={friends} incoming={incoming} outgoing={outgoing} />
        )}
      </div>
    </main>
  );
}

/** Shown when the friendships query fails — almost always a missing migration. */
function SchemaNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm dark:border-amber-500/20 dark:bg-amber-500/10">
      <p className="mb-2 font-medium text-amber-800 dark:text-amber-300">
        Couldn&rsquo;t load your friends
      </p>
      <p className="text-amber-700/90 dark:text-amber-400/90">{message}</p>
      <p className="mt-2 text-amber-700/90 dark:text-amber-400/90">
        If this mentions a missing table <code>friendships</code>, run migration{" "}
        <code>0010_friendships.sql</code> in the Supabase SQL Editor, then reload.
      </p>
    </div>
  );
}
