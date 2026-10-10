import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { EventFeePanel } from "@/components/EventFeePanel";
import { PostComposer } from "@/components/PostComposer";
import { AddSectionBar } from "@/components/SectionControls";
import { EventPhotos } from "@/components/EventPhotos";
import type { ViewerPhoto } from "@/components/PhotoViewer";
import { serverTimeZone } from "@/lib/tz";
import { dayInTz } from "@/lib/calendarSort";
import { publicImageUrl } from "@/lib/storage";

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

  // Before the event the page is for planning; once its day has passed it
  // leads with photos and settling up, and tucks the plan away.
  const tz = await serverTimeZone();
  const eventDay = ev.starts_at ? dayInTz(ev.starts_at, tz) : null;
  const today = dayInTz(Date.now(), tz);
  const isPast = !!eventDay && !!today && eventDay < today;

  // Photos = posts linked to this event, from anyone on it.
  let photos: ViewerPhoto[] = [];
  let photoPeople = 0;
  let pinnedKeys: string[] = [];
  if (isPast) {
    const { data: postRows } = await admin
      .from("posts")
      .select("id, author_id, image_path, image_paths, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: false });
    const rows = (postRows ?? []) as {
      id: string;
      author_id: string;
      image_path: string | null;
      image_paths: string[] | null;
      created_at: string;
    }[];
    photoPeople = new Set(rows.map((r) => r.author_id)).size;
    const authorIds = [...new Set(rows.map((r) => r.author_id))];
    const [{ data: authors }, { data: pins }] = await Promise.all([
      authorIds.length
        ? admin.from("profiles").select("id, username, display_name").in("id", authorIds)
        : Promise.resolve({ data: [] as { id: string; username: string | null; display_name: string | null }[] }),
      // Which of these are already on MY grid (0040; empty before it runs).
      rows.length
        ? admin.from("grid_pins").select("post_id, image_index").eq("user_id", actorId).in("post_id", rows.map((r) => r.id))
        : Promise.resolve({ data: [] as { post_id: string; image_index: number }[] }),
    ]);
    const nameOf = new Map(
      (authors ?? []).map((a) => [a.id as string, (a.display_name as string) || (a.username as string) || "someone"]),
    );
    pinnedKeys = (pins ?? []).map((p) => `${p.post_id}:${p.image_index}`);
    photos = rows
      .flatMap((r) => {
        const paths = r.image_paths?.length ? r.image_paths : r.image_path ? [r.image_path] : [];
        const date = new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
        return paths.map((path, index) => ({
          postId: r.id,
          index,
          url: publicImageUrl(path) ?? "",
          author: r.author_id === actorId ? "You" : nameOf.get(r.author_id) ?? "someone",
          date,
        }));
      })
      .filter((p) => p.url)
      .slice(0, 60);
  }

  const headerData = {
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
  };

  const people = (
    <PeopleSection
      eventId={id}
      eventTitle={title}
      canInvite={isHost || (isGuest && allowReinvite)}
      isHost={isHost}
      allowReinvite={allowReinvite}
    />
  );
  const chat = (
    <Section title="Chat">
      <CommentsSection eventId={id} />
    </Section>
  );

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
        <div className="mb-2 flex h-12 items-center">
          <Link
            href="/calendar"
            aria-label="Back to Calendar"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-200/60"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </Link>
        </div>

        {isPast ? (
          <>
            <header className="mb-6 space-y-1.5">
              <h1 className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900">{title}</h1>
              <p className="text-sm text-neutral-600">
                {[when, ev.location].filter(Boolean).join(" · ")}
              </p>
            </header>

            <div className="space-y-8">
              <EventPhotos
                photos={photos}
                people={photoPeople}
                title={title}
                initialPinned={pinnedKeys}
                addButton={<PostComposer eventId={id} eventDate={eventDay} variant="button" />}
              />

              {feeCents > 0 && (
                <EventFeePanel
                  cardId={myCard?.id as string | undefined}
                  feeCents={feeCents}
                  venmoId={ev.venmo_id || null}
                  zelleId={ev.zelle_id || null}
                  paymentLink={ev.payment_link || null}
                  feePaid={feePaid}
                  isHost={isHost}
                  note={title}
                />
              )}
              {hasMod("expenses") && <LedgerSection eventId={id} />}
              {chat}

              <details className="group rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between px-4 text-[15px] font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
                  Event details
                  <ChevronRight className="h-4 w-4 text-neutral-500 transition group-open:rotate-90" />
                </summary>
                <div className="space-y-8 border-t border-neutral-100 p-4">
                  <EventHeader data={headerData} />
                  {people}
                  {hasMod("carpool") && <CarpoolSection eventId={id} />}
                  {hasMod("tasks") && <TaskSection eventId={id} />}
                </div>
              </details>
            </div>
          </>
        ) : (
          <>
            <EventHeader data={headerData} />
            <div className="space-y-8">
              {isGuest && (
                <EventActions data={{ cardId: myCard?.id as string | undefined, isHost, status: rsvpStatus }} />
              )}
              {people}
              {isHost && <AddSectionBar eventId={id} modules={modules} />}
              {hasMod("carpool") && <CarpoolSection eventId={id} />}
              {hasMod("tasks") && <TaskSection eventId={id} />}
              {hasMod("expenses") && <LedgerSection eventId={id} />}
              {chat}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
