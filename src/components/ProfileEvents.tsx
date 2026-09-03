import Link from "next/link";
import { CalendarClock, MapPin, ChevronRight } from "lucide-react";

export interface HostedEventItem {
  id: string;
  title: string;
  when: string;
  startsAt: string | null;
  location: string | null;
}

function key(s: string | null): number {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/** A host's events on their profile: upcoming first, past below. `clickable`
 *  links each to its event page — only where the viewer can actually open it
 *  (their own profile), since the event page is attendee-only for now. */
export function ProfileEvents({
  events,
  clickable = true,
}: {
  events: HostedEventItem[];
  clickable?: boolean;
}) {
  if (events.length === 0) return null;

  const now = Date.now();
  const withPast = events.map((e) => ({
    ...e,
    past: e.startsAt ? Date.parse(e.startsAt) < now : false,
  }));
  const upcoming = withPast.filter((e) => !e.past).sort((a, b) => key(a.startsAt) - key(b.startsAt));
  const past = withPast.filter((e) => e.past).sort((a, b) => key(b.startsAt) - key(a.startsAt));

  return (
    <section className="mb-6">
      {upcoming.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            Upcoming events
          </h2>
          <div className="space-y-2">
            {upcoming.map((e) => (
              <EventRow key={e.id} item={e} clickable={clickable} />
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            Past events
          </h2>
          <div className="space-y-2">
            {past.map((e) => (
              <EventRow key={e.id} item={e} muted clickable={clickable} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function EventRow({
  item,
  muted = false,
  clickable = true,
}: {
  item: HostedEventItem;
  muted?: boolean;
  clickable?: boolean;
}) {
  const base = `group flex items-center gap-3 rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${
    clickable ? "transition hover:border-neutral-300 hover:shadow-md dark:hover:border-neutral-700" : ""
  } ${muted ? "opacity-70" : ""}`;

  const inner = (
    <>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          muted
            ? "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
            : "bg-fuchsia-50 text-fuchsia-500 dark:bg-fuchsia-500/10 dark:text-fuchsia-400"
        }`}
      >
        <CalendarClock className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[0.95rem] font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
          {item.title}
        </h3>
        {item.when && (
          <p className="mt-0.5 text-sm font-medium text-neutral-700 dark:text-neutral-200">{item.when}</p>
        )}
        {item.location && (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            <MapPin className="h-3.5 w-3.5" />
            {item.location}
          </p>
        )}
      </div>
      {clickable && (
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition group-hover:text-neutral-500 dark:text-neutral-600" />
      )}
    </>
  );

  if (!clickable) {
    return <div className={base}>{inner}</div>;
  }
  return (
    <Link href={`/event/${item.id}`} className={base}>
      {inner}
    </Link>
  );
}
