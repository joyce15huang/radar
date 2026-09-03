import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActor } from "@/lib/actor";
import { myFollowerCount } from "@/app/poll-actions";
import { PollCompose } from "@/components/PollCompose";

/** Compose a Group event (typed people / groups) or a Public event (broadcast
 *  to all your followers), chosen via ?type=public from the Create menu. */
export default async function NewGroupEventPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { type } = await searchParams;
  const isPublic = type === "public";
  const followerCount = isPublic ? await myFollowerCount() : 0;

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <Link
          href="/calendar"
          className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="h-4 w-4" /> Calendar
        </Link>

        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {isPublic ? "Public event" : "Group event"}
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            {isPublic
              ? "Broadcast an event to everyone who follows you. It drops into their deck to RSVP."
              : "Share what you're doing, where, and the cost. Set a time — or propose a few and let everyone weigh in. Only you see who's free."}
          </p>
        </header>

        <PollCompose audience={isPublic ? "followers" : "list"} followerCount={followerCount} />
      </div>
    </main>
  );
}
