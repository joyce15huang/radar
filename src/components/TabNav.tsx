"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Calendar, Users, User } from "lucide-react";

const TABS = [
  { href: "/", label: "Today", icon: Newspaper },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/friends", label: "Friends", icon: Users },
  { href: "/me", label: "Profile", icon: User },
];

export function TabNav() {
  const pathname = usePathname();

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
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[13px] font-medium transition-colors ${
              active
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
