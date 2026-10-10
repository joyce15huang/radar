"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Sparkles, User, Bell } from "lucide-react";
import { inboxCount } from "@/app/inbox-actions";

const TABS = [
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/today", label: "Today", icon: Sparkles },
  { href: "/inbox", label: "Inbox", icon: Bell },
  { href: "/me", label: "Profile", icon: User },
];

/** Fixed bottom tab bar (mobile-app style). Renders wherever it's mounted. */
export function TabNav() {
  const pathname = usePathname();
  const [requests, setRequests] = useState(0);

  // Inbox badge: event invites + friend requests waiting on you.
  useEffect(() => {
    let live = true;
    inboxCount()
      .then((n) => live && setRequests(n))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname]);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid h-16 max-w-xl grid-cols-4">
        {TABS.map((t) => {
          const active =
            t.href === "/me"
                ? pathname.startsWith("/me") || pathname.startsWith("/library") || pathname.startsWith("/profile")
                : pathname.startsWith(t.href);
          const Icon = t.icon;
          const showBadge = t.href === "/inbox" && requests > 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
                active ? "font-semibold text-neutral-900" : "font-medium text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <span className="relative">
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.9} />
                {showBadge && (
                  <span
                    aria-label={`${requests} waiting in your inbox`}
                    className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-none text-white"
                  >
                    {requests > 9 ? "9+" : requests}
                  </span>
                )}
              </span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
