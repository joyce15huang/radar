"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Sparkles, User, MessageCircle } from "lucide-react";
import { chatsBadge } from "@/app/chat-list-actions";

const TABS = [
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/today", label: "Today", icon: Sparkles },
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/me", label: "Profile", icon: User },
];

/** Fixed bottom tab bar (mobile-app style). Renders wherever it's mounted. */
export function TabNav() {
  const pathname = usePathname();
  const [requests, setRequests] = useState(0);

  // Chats badge: unread messages + invites and friend requests waiting on you.
  useEffect(() => {
    let live = true;
    chatsBadge()
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
              ? ["/me", "/library", "/profile", "/friends", "/teams", "/team/", "/u/"].some((p) => pathname.startsWith(p))
              : t.href === "/chats"
                ? ["/chats", "/chat/", "/inbox"].some((p) => pathname.startsWith(p))
                : t.href === "/today"
                  ? pathname.startsWith("/today") || pathname.startsWith("/post/")
                  : pathname.startsWith(t.href);
          const Icon = t.icon;
          const showBadge = t.href === "/chats" && requests > 0;
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
                    aria-label={`${requests} unread or waiting`}
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
