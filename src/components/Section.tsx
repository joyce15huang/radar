import type { ReactNode } from "react";

/**
 * A plain, always-open event-page section: an uppercase label, an optional
 * header action (e.g. the host's remove control), and the body. Replaces the
 * old collapsible wrapper — sections are added on demand now, so there's
 * nothing to collapse.
 */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-neutral-900">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
