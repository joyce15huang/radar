import Link from "next/link";
import type { PastPlan } from "@/app/plan-photo-actions";
import { AddPhotos } from "./AddPhotos";

function shortDate(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz }).replace(`, ${new Date().getFullYear()}`, "");
}

/** A profile's past plans: one tile per plan, its best photo as the cover. */
export function PastPlansGrid({ plans, isOwner, tz }: { plans: PastPlan[]; isOwner: boolean; tz: string }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">Past plans</h2>
        {isOwner && <AddPhotos />}
      </div>

      {plans.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-[14px] text-neutral-500">
          {isOwner ? "Plans you’ve been to show up here with their photos." : "No shared plans yet."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-2.5 gap-y-4">
          {plans.map((p) => {
            const label = (
              <span className="mt-1.5 block">
                <span className="block truncate text-[14px] font-bold text-neutral-900">{p.title}</span>
                <span className="block truncate text-[12px] text-neutral-500">
                  {shortDate(p.startsAt, tz)}
                  {p.went > 1 ? ` · ${p.went} went` : ""}
                </span>
              </span>
            );
            const cover = (
              <span className="relative block aspect-square overflow-hidden rounded-2xl bg-neutral-200">
                {p.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
                )}
                {p.photoCount > 0 && (
                  <span className="absolute bottom-2 left-2 rounded-[7px] bg-neutral-900/70 px-2 py-1 text-[12px] font-semibold text-white">
                    {p.photoCount} {p.photoCount === 1 ? "photo" : "photos"}
                  </span>
                )}
                {p.hosted && (
                  <span className="absolute left-2 top-2 rounded-[7px] bg-white px-2 py-0.5 text-[11px] font-bold text-fuchsia-800">Hosted</span>
                )}
              </span>
            );
            return (
              <li key={p.id}>
                {isOwner && p.photoCount === 0 ? (
                  <>
                    <AddPhotos eventId={p.id} eventTitle={p.title} variant="tile" />
                    <Link href={`/event/${p.id}`}>{label}</Link>
                  </>
                ) : p.canOpen ? (
                  <Link href={`/event/${p.id}`}>
                    {cover}
                    {label}
                  </Link>
                ) : (
                  <div>
                    {cover}
                    {label}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
