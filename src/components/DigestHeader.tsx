import { Sparkles } from "lucide-react";

interface DigestHeaderProps {
  /** e.g. "Friday Briefing" */
  dateLabel: string;
  /** e.g. "August 7" */
  dateSub: string;
  remaining: number;
  total: number;
}

export function DigestHeader({ dateLabel, dateSub, remaining, total }: DigestHeaderProps) {
  const allDone = remaining === 0;

  return (
    <header className="mb-6 flex items-end justify-between">
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          Your Daily Digest
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {dateLabel}
        </h1>
        <p className="text-sm text-neutral-400 dark:text-neutral-500">{dateSub}</p>
      </div>

      {/* Remaining-count pill */}
      <div
        className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium tabular-nums transition-colors ${
          allDone
            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        }`}
        aria-live="polite"
      >
        {allDone ? "All clear" : `${remaining} of ${total} left`}
      </div>
    </header>
  );
}
