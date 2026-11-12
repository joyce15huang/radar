import Link from "next/link";

interface Stat {
  value: number;
  label: string;
  href?: string;
  dot?: boolean;
}

/** The small counts row under a profile header. Zero-value stats are dropped. */
export function ProfileStats({ stats }: { stats: Stat[] }) {
  const shown = stats.filter((s) => s.value > 0 || s.href);
  if (shown.length === 0) return null;
  return (
    <div
      className="mb-6 grid divide-x divide-neutral-100 rounded-2xl bg-white py-3 shadow-[0_8px_24px_rgba(80,50,35,0.07)]"
      style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}
    >
      {shown.map((s) => {
        const body = (
          <>
            <span className="relative text-[18px] font-bold text-neutral-900">
              {s.value}
              {s.dot && <span className="absolute -right-2.5 top-0.5 h-2 w-2 rounded-full bg-rose-500" aria-label="New requests" />}
            </span>
            <span className="text-[12px] font-medium text-neutral-500">{s.label}</span>
          </>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} className="flex flex-col items-center gap-px">
            {body}
          </Link>
        ) : (
          <span key={s.label} className="flex flex-col items-center gap-px">
            {body}
          </span>
        );
      })}
    </div>
  );
}
