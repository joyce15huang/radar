import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getActor } from "@/lib/actor";
import { createAdminClient } from "@/lib/supabase/admin";
import { getChat } from "@/app/comment-actions";
import { PlanChat } from "@/components/PlanChat";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One chat, full screen: a plan's group chat, or (?with=) a private thread on it. */
export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { id } = await params;
  const peer = (await searchParams).with;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=/chat/${id}`);
  if (!UUID_RE.test(id) || (peer && !UUID_RE.test(peer))) notFound();

  // getChat authorizes: null unless the caller is on the plan.
  const view = await getChat(id);
  if (!view) notFound();
  const { data: ev } = await createAdminClient().from("events").select("title, event_time").eq("id", id).maybeSingle();
  const thread = peer ? view.privateThreads.find((t) => t.otherId === peer) : null;
  if (peer && !thread) notFound();

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
        <header className="mb-4 flex items-center gap-1 border-b border-neutral-200 pb-3">
          <Link
            href="/chats"
            aria-label="Back to Chats"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-200/60"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </Link>
          <Link href={`/event/${id}`} className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-bold tracking-tight text-neutral-900">
              {thread ? thread.otherName : (ev?.title ?? "Plan")}
            </span>
            <span className="block truncate text-[12px] font-medium text-neutral-500">
              {thread ? `Private · ${ev?.title ?? "Plan"}` : [ev?.event_time, "Open the plan"].filter(Boolean).join(" · ")}
            </span>
          </Link>
        </header>
        <PlanChat eventId={id} show={peer ?? "group"} bare />
      </div>
    </main>
  );
}
