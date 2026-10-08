"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Calendar, User } from "lucide-react";
import { pendingRequestCount } from "@/app/friends-actions";

const TABS = [
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/", label: "Today", icon: Newspaper },
  { href: "/me", label: "Profile", icon: User },
];

export function TabNav() {
  const pathname = usePathname();
  const [requests, setRequests] = useState(0);

  // Refresh the friend-request badge on each navigation. It reflects pending
  // requests, so it clears itself as you accept/decline them (no seen-tracking).
  useEffect(() => {
    let live = true;
    pendingRequestCount()
      .then((n) => live && setRequests(n))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname]);

  return (
    <nav className="mb-6 flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {TABS.map((t) => {
        const active =
          t.href === "/"
            ? pathname === "/"
            : t.href === "/me"
              ? pathname.startsWith("/me") ||
                pathname.startsWith("/library") ||
                pathname.startsWith("/profile")
              : pathname.startsWith(t.href);
        const Icon = t.icon;
        // The friend-request badge rides the Profile tab.
        const showBadge = t.href === "/me" && !active && requests > 0;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[13px] font-medium transition-colors ${
              active
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
            {t.label}
            {showBadge && (
              <span
                aria-label={`${requests} friend request${requests === 1 ? "" : "s"}`}
                className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white"
              >
                {requests > 9 ? "9+" : requests}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
