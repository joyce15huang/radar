"use client";

import { useState } from "react";
import { LayoutGrid, CalendarClock, Users } from "lucide-react";
import { ProfileWall, type ProfilePost } from "./ProfileWall";
import { ProfileEvents, type HostedEventItem } from "./ProfileEvents";
import { FriendsClient } from "./FriendsClient";
import { EmptyState } from "./LibraryWall";
import type { FriendEntry, FriendRequestEntry } from "@/lib/friends";

type Tab = "posts" | "events" | "friends";

/** Profile subtabs. Your own profile adds a Friends tab (requests + friends +
 *  add-by-username); visitors see only Posts | Events. */
export function ProfilePanels({
  posts,
  events,
  isOwner,
  friends = [],
  requests = [],
  initialTab = "posts",
  ownerName,
}: {
  posts: ProfilePost[];
  events: HostedEventItem[];
  isOwner: boolean;
  friends?: FriendEntry[];
  requests?: FriendRequestEntry[];
  initialTab?: Tab;
  ownerName?: string;
}) {
  const [tab, setTab] = useState<Tab>(isOwner ? initialTab : "posts");

  return (
    <div className="mt-1">
      <div className="flex border-b border-neutral-200 dark:border-neutral-800">
        <TabButton
          active={tab === "posts"}
          onClick={() => setTab("posts")}
          icon={<LayoutGrid className="h-4 w-4" strokeWidth={2} />}
          label="Posts"
          count={posts.length}
        />
        <TabButton
          active={tab === "events"}
          onClick={() => setTab("events")}
          icon={<CalendarClock className="h-4 w-4" strokeWidth={2} />}
          label="Events"
          count={events.length}
        />
        {isOwner && (
          <TabButton
            active={tab === "friends"}
            onClick={() => setTab("friends")}
            icon={<Users className="h-4 w-4" strokeWidth={2} />}
            label="Friends"
            count={friends.length}
            dot={requests.length > 0}
          />
        )}
      </div>

      <div className="pt-4">
        {tab === "posts" ? (
          <ProfileWall posts={posts} isOwner={isOwner} ownerName={ownerName} />
        ) : tab === "events" ? (
          events.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-7 w-7" strokeWidth={2} />}
              title="No events yet"
              body={
                isOwner
                  ? "Events you host show up here — upcoming first, past below."
                  : "This person hasn't hosted any events yet."
              }
            />
          ) : (
            <ProfileEvents events={events} clickable={isOwner} />
          )
        ) : (
          <FriendsClient friends={friends} requests={requests} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  dot = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`relative -mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm font-medium transition ${
        active
          ? "border-neutral-900 text-neutral-900 dark:border-neutral-50 dark:text-neutral-50"
          : "border-transparent text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
      }`}
    >
      {icon}
      {label}
      <span className={active ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-300 dark:text-neutral-600"}>
        {count}
      </span>
      {dot && !active && <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-rose-500" aria-hidden />}
    </button>
  );
}
