import Link from "next/link";
import type { PastPlan } from "@/app/plan-photo-actions";
import { AddPhotos } from "./AddPhotos";
import { NoPhotoPlans } from "./NoPhotoPlans";

function shortDate(iso: string, tz: string): string {
  const d = new Date(iso);
  const sameYear = d.toLocaleDateString("en-US", { year: "numeric", timeZone: tz }) === new Date().toLocaleDateString("en-US", { year: "numeric", timeZone: tz });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: tz });
}

/**
 * A profile's past plans. Plans with photos are big tiles (the photo is the
 * cover); plans without are a compact list, so the grid only ever shows photos.
 */
export function PastPlansGrid({ plans, isOwner, tz }: { plans: PastPlan[]; isOwner: boolean; tz: string }) {
  const withPhotos = plans.filter((p) => p.photoCount > 0);
  const without = plans.filter((p) => p.photoCount === 0);
  const rows = without.map((p) => {
    const d = new Date(p.startsAt);
    return {
      id: p.id,
      title: p.title,
      month: d.toLocaleDateString("en-US", { month: "short", timeZone: tz }),
      day: d.toLocaleDateString("en-US", { day: "numeric", timeZone: tz }),
      sub: [d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz }), p.hosted ? "Hosted" : null, p.went > 1 ? `${p.went} went` : null]
        .filter(Boolean)
        .join(" · "),
      canOpen: p.canOpen,
    };
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">Past plans</h2>
        {isOwner && <AddPhotos />}
      </div>

      {plans.length === 0 && (
        <p className="rounded-2xl bg-white px-4 py-6 text-center text-[14px] text-neutral-500 shadow-[0_8px_24px_rgba(80,50,35,0.07)]">
          {isOwner ? "Plans you’ve been to show up here with their photos." : "No shared plans yet."}
        </p>
      )}

      {withPhotos.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-2.5 gap-y-4">
          {withPhotos.map((p) => {
            const body = (
              <>
                <span className="relative block aspect-square overflow-hidden rounded-2xl bg-neutral-200">
                  {p.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute bottom-2 left-2 rounded-[7px] bg-neutral-900/70 px-2 py-1 text-[12px] font-semibold text-white">
                    {p.photoCount} {p.photoCount === 1 ? "photo" : "photos"}
                  </span>
                  {p.hosted && (
                    <span className="absolute left-2 top-2 rounded-[7px] bg-white px-2 py-0.5 text-[11px] font-bold text-fuchsia-800">Hosted</span>
                  )}
                </span>
                <span className="mt-1.5 block">
                  <span className="block truncate text-[14px] font-bold text-neutral-900">{p.title}</span>
                  <span className="block truncate text-[12px] text-neutral-500">
                    {shortDate(p.startsAt, tz)}
                    {p.went > 1 ? ` · ${p.went} went` : ""}
                  </span>
                </span>
              </>
            );
            return <li key={p.id}>{p.canOpen ? <Link href={`/event/${p.id}`}>{body}</Link> : <div>{body}</div>}</li>;
          })}
        </ul>
      )}

      {rows.length > 0 && <NoPhotoPlans rows={rows} isOwner={isOwner} />}
    </section>
  );
}
