import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";

interface AccountBarProps {
  email: string | null | undefined;
  /** The nav link to show on the right, e.g. Profile from the feed, or Feed from Profile. */
  link: { href: string; label: string };
}

export function AccountBar({ email, link }: AccountBarProps) {
  return (
    <div className="mb-6 flex items-center justify-between border-b border-neutral-200/70 pb-3 text-sm dark:border-neutral-800">
      <span className="truncate text-neutral-400 dark:text-neutral-500">{email}</span>
      <div className="flex items-center gap-4">
        <Link
          href={link.href}
          className="font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
        >
          {link.label}
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
