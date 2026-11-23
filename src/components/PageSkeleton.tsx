import { TabNav } from "@/components/TabNav";

/** Shown the instant a tab or page is tapped, while the server prepares it. */
export function PageSkeleton({ title, tabs = true, rows = 5 }: { title?: string; tabs?: boolean; rows?: number }) {
  return (
    <main className="min-h-dvh bg-linen" aria-busy="true">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
        {tabs && <TabNav />}
        {title ? (
          <h1 className="mb-4 text-[30px] font-bold leading-tight tracking-tight text-neutral-900">{title}</h1>
        ) : (
          <div className="mb-5 h-8 w-40 animate-pulse rounded-lg bg-neutral-200/70" />
        )}
        <div className="space-y-4">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex animate-pulse gap-3">
              <div className="h-9 w-9 shrink-0 rounded-full bg-neutral-200/70" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3.5 w-1/3 rounded bg-neutral-200/70" />
                <div className="h-3.5 w-11/12 rounded bg-neutral-200/60" />
                <div className="h-3.5 w-2/3 rounded bg-neutral-200/50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
