import { CalendarRange, MapPin } from "lucide-react";

/**
 * The top of a text-led Explore card: a date tile, the "when" in brick above the
 * title, then where. With no date, a green "Season" tile stands in.
 */
export function DateLead({
  top,
  day,
  when,
  title,
  where,
}: {
  /** Tile label + number ("SAT", "21"); omit both for undated things. */
  top?: string;
  day?: string;
  when: string;
  title: string;
  where?: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3.5">
        {top && day ? (
          <span className="flex h-[62px] w-14 shrink-0 flex-col items-center justify-center rounded-[15px] bg-neutral-900 text-white">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-200">{top}</span>
            <span className="text-[23px] font-bold leading-none">{day}</span>
          </span>
        ) : (
          <span className="flex h-[62px] w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[15px] bg-green-100 text-green-800">
            <CalendarRange className="h-5 w-5" strokeWidth={2.1} />
            <span className="text-[9px] font-bold uppercase tracking-wide">Anytime</span>
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-[14px] font-bold text-fuchsia-800">{when}</span>
          <span className="block text-[19px] font-bold leading-tight tracking-tight text-neutral-900">{title}</span>
        </span>
      </div>
      {where && (
        <p className="flex items-center gap-1.5 text-[14px] font-semibold text-neutral-900">
          <MapPin className="h-[15px] w-[15px] shrink-0 text-neutral-600" strokeWidth={2.2} />
          <span className="min-w-0 truncate">{where}</span>
        </p>
      )}
    </div>
  );
}
