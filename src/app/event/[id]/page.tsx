import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { EventActions } from "@/components/EventActions";
import { EventHeader } from "@/components/EventHeader";
import { PeopleSection } from "@/components/PeopleSection";
import { CarpoolSection } from "@/components/CarpoolSection";
import { LedgerSection } from "@/components/LedgerSection";
import { TaskSection } from "@/components/TaskSection";
import { CommentsSection } from "@/components/CommentsSection";
import { Section } from "@/components/Section";

interface EventRow {
  id: string;
  creator_id: string;
  title: string | null;
  event_time: string | null;
  location: string | null;
  note: string | null;
  summary: string | null;
  source_url: string | null;
  starts_at: string | null;
  fee_cents: number | null;
  payment_link: string | null;
  venmo_id: string | null;
  zelle_id: string | null;
  allow_reinvite: boolean | null;
  modules: string[] | null;
}

/**
 * The canonical detail page for one shared event — the single home for
 * everything about it. Today it carries Overview + Cost + People; the ledger,
 * carpool, tasks, and comments modules will each land as another section here.
 * Authorized: only the host or someone on the guest list may view it.
 */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { actorId } = actor;

  const admin = createAdminClient();
  const { data: evData } = await admin
    .from("events")
    .select(
      "id, creator_id, title, event_time, location, note, summary, source_url, starts_at, fee_cents, payment_link, venmo_id, zelle_id, allow_reinvite, modules",
    )
    .eq("id", id)
    .maybeSingle();
  const ev = (evData as EventRow) ?? null;
  if (!ev) notFound();

  const isHost = ev.creator_id === actorId;

  // Authorize: host, or someone who holds an invite card for this event.
  const { data: myCard } = await admin
    .from("cards")
    .select("id, status, content")
    .eq("event_id", id)
    .eq("user_id", actorId)
    .maybeSingle();
  if (!isHost && !myCard) notFound();

  const myContent = (myCard?.content ?? {}) as Record<string, string | null>;
  const feePaid = myContent.feePaid === "true";
  const feeCents = ev.fee_cents ?? 0;
  const modules = (ev.modules ?? []) as string[];
  const hasMod = (m: string) => modules.includes(m);

  const isGuest = !isHost && !!myCard;
  const allowReinvite = ev.allow_reinvite ?? false;
  const rsvpStatus: "accepted" | "pending" | "none" =
    myCard?.status === "accepted" ? "accepted" : myCard?.status === "pending" ? "pending" : "none";
  const hasTime = ev.starts_at ? /T\d\d:\d\d/.test(ev.starts_at) : false;

  let hostName = "the host";
  if (!isHost) {
    const { data: hp } = await admin
      .from("profiles")
      .select("username, email")
      .eq("id", ev.creator_id)
      .maybeSingle();
    hostName = hp?.username
      ? `@${hp.username}`
      : ((hp?.email as string | null)?.split("@")[0] ?? "the host");
  }

  const title = ev.title ?? "Event";
  const when = ev.event_time ?? "";
  const sourceUrl = ev.source_url ?? null;

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <Link
          href="/calendar"
          className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="h-4 w-4" /> Calendar
        </Link>

        {/* Overview + host edit */}
        <EventHeader
          data={{
            eventId: id,
            isHost,
            title,
            when,
            location: ev.location ?? "",
            hostName,
            displayNote: ev.note || ev.summary || "",
            sourceUrl,
            startsAt: ev.starts_at ?? null,
            hasTime,
            note: ev.note ?? "",
            feeCents,
            paymentLink: ev.payment_link ?? "",
            venmoId: ev.venmo_id ?? "",
            zelleId: ev.zelle_id ?? "",
            allowReinvite,
            cardId: myCard?.id as string | undefined,
            feePaid,
            modules,
          }}
        />

        {isGuest && (
          <div className="mb-5">
            <EventActions
              data={{
                cardId: myCard?.id as string | undefined,
                isHost,
                status: rsvpStatus,
              }}
            />
          </div>
        )}

        <div className="mt-6 space-y-8">
          <PeopleSection
            eventId={id}
            eventTitle={title}
            canInvite={isHost || (isGuest && allowReinvite)}
            isHost={isHost}
            allowReinvite={allowReinvite}
          />

          {hasMod("carpool") && <CarpoolSection eventId={id} />}

          {hasMod("expenses") && <LedgerSection eventId={id} />}

          {hasMod("tasks") && <TaskSection eventId={id} />}

          <Section title="Comments">
            <CommentsSection eventId={id} />
          </Section>
        </div>
      </div>
    </main>
  );
}
