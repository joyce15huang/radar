import type { Headcount } from "@/lib/teams";
import { shortBy } from "@/lib/teams";

/**
 * "6 in · need 8" with a bar: solid = in, light = maybe, and a tick at the
 * minimum. Practices (no minimum) just show the in-count.
 */
export function HeadcountBar({ h, size = "md" }: { h: Headcount; size?: "sm" | "md" }) {
  const total = Math.max(1, h.in + h.maybe + h.out + h.none, h.min ?? 0);
  const pct = (n: number) => `${Math.min(100, (n / total) * 100)}%`;
  const short = shortBy(h);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className={`${size === "sm" ? "text-[14px]" : "text-[15px]"} font-bold text-neutral-900`}>
          {h.in} in
          {h.min !== null && <span className="font-medium text-neutral-500"> · need {h.min} to play</span>}
        </p>
        {h.min !== null &&
          (short > 0 ? (
            <span className="shrink-0 text-[13px] font-bold text-fuchsia-800">{short} short</span>
          ) : (
            <span className="shrink-0 text-[13px] font-bold text-green-700">Enough</span>
          ))}
      </div>
      <div
        role="img"
        aria-label={`${h.in} in, ${h.maybe} maybe${h.min !== null ? `, ${h.min} needed` : ""}`}
        className="relative flex h-2 overflow-visible rounded-full bg-neutral-200"
      >
        <span className="h-full rounded-l-full bg-neutral-900" style={{ width: pct(h.in) }} />
        <span className="h-full bg-neutral-300" style={{ width: pct(h.maybe) }} />
        {h.min !== null && (
          <span className="absolute -top-[3px] h-[14px] w-0.5 rounded bg-fuchsia-700" style={{ left: pct(h.min) }} />
        )}
      </div>
      <p className="text-[13px] font-medium text-neutral-500">
        {[
          `${h.in} in`,
          h.maybe ? `${h.maybe} maybe` : null,
          h.out ? `${h.out} out` : null,
          h.none ? `${h.none} haven’t answered` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}
