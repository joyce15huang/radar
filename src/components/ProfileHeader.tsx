"use client";

import { Globe, AtSign, BadgeCheck } from "lucide-react";
import { initials } from "@/lib/cardTypes";
import { FriendButton } from "./FriendButton";
import type { FriendEntry, FriendState } from "@/lib/friends";

export interface ProfileHeaderData {
  name: string;
  verified: boolean;
  bio: string | null;
  avatarUrl: string | null;
  links: { website?: string; instagram?: string; twitter?: string };
}

/**
 * Profile header — identity + content, no vanity counts. Your own Friends live in
 * a profile subtab. A visitor's profile shows a mutual-friends line + Add-friend.
 */
export function ProfileHeader({
  data,
  targetId,
  friendState,
  mutuals = [],
}: {
  data: ProfileHeaderData;
  targetId?: string;
  friendState?: FriendState;
  mutuals?: FriendEntry[];
}) {
  return (
    <header className="mb-6">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-lg font-semibold text-white dark:bg-white dark:text-neutral-900">
          {data.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.avatarUrl} alt={data.name} className="h-full w-full object-cover" />
          ) : (
            initials(data.name)
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              {data.name}
            </h1>
            {data.verified && <BadgeCheck className="h-5 w-5 text-sky-500" aria-label="Verified" />}
          </div>

          {data.bio && (
            <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{data.bio}</p>
          )}

          {(data.links.website || data.links.instagram || data.links.twitter) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {data.links.website && (
                <LinkChip href={data.links.website} icon={<Globe className="h-3.5 w-3.5" />} label={hostname(data.links.website)} />
              )}
              {data.links.instagram && (
                <LinkChip href={`https://instagram.com/${data.links.instagram}`} icon={<AtSign className="h-3.5 w-3.5" />} label={`${data.links.instagram} · IG`} />
              )}
              {data.links.twitter && (
                <LinkChip href={`https://x.com/${data.links.twitter}`} icon={<AtSign className="h-3.5 w-3.5" />} label={`${data.links.twitter} · X`} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Visitor: mutual friends + add friend */}
      {targetId && friendState && (
        <div className="mt-4 flex flex-col gap-2">
          {mutuals.length > 0 && <MutualLine mutuals={mutuals} />}
          <FriendButton targetId={targetId} initial={friendState} />
        </div>
      )}
    </header>
  );
}

function MutualLine({ mutuals }: { mutuals: FriendEntry[] }) {
  const names = mutuals.map((m) => (m.username ? `@${m.username}` : m.name));
  const shown = names.slice(0, 2);
  const extra = names.length - shown.length;
  const text =
    extra > 0 ? `${shown.join(", ")} +${extra} other${extra === 1 ? "" : "s"}` : shown.join(" and ");
  return (
    <p className="text-xs text-neutral-500 dark:text-neutral-400">
      <span className="text-neutral-400 dark:text-neutral-500">Friends with </span>
      {text}
    </p>
  );
}

function LinkChip({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-white"
    >
      {icon}
      {label}
    </a>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}
