"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Image as ImageIcon, Bookmark } from "lucide-react";

/** Sub-navigation inside Profile: your Posts and your saved Library. */
const SUBTABS = [
  { href: "/me", label: "Posts", icon: ImageIcon },
  { href: "/library", label: "Saved", icon: Bookmark },
];

export function ProfileTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-5 flex items-center gap-1.5">
      {SUBTABS.map((t) => {
        const active = pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors ${
              active
                ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white"
                : "text-neutral-500 ring-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:ring-neutral-800 dark:hover:text-white"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
