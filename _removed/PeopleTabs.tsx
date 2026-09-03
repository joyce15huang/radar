"use client";

import { useState } from "react";
import { FriendsClient } from "./FriendsClient";
import { GroupsClient } from "./GroupsClient";
import type { FriendEntry, FriendRequestEntry } from "@/lib/friends";
import type { GroupWithMembers } from "@/app/group-actions";

type Tab = "friends" | "requests" | "groups";

/** The friends management panel — Friends / Requests / Groups — shown inside the
 *  profile's People sheet. */
export function PeopleTabs({
  friends,
  requests,
  groups,
  initialTab = "friends",
}: {
  friends: FriendEntry[];
  requests: FriendRequestEntry[];
  groups: GroupWithMembers[];
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div>
      <div className="mb-4 inline-flex rounded-full bg-neutral-100 p-1 dark:bg-neutral-800">
        <Pill active={tab === "friends"} onClick={() => setTab("friends")} label="Friends" count={friends.length} />
        <Pill active={tab === "requests"} onClick={() => setTab("requests")} label="Requests" count={requests.length} dot={requests.length > 0} />
        <Pill active={tab === "groups"} onClick={() => setTab("groups")} label="Groups" count={groups.length} />
      </div>

      {tab === "groups" ? (
        <GroupsClient groups={groups} />
      ) : (
        <FriendsClient friends={friends} requests={requests} view={tab} />
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
  count,
  dot = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
        active
          ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-950 dark:text-neutral-50"
          : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
      }`}
    >
      {label}
      <span className={active ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-400 dark:text-neutral-600"}>
        {count}
      </span>
      {dot && !active && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500" aria-hidden />}
    </button>
  );
}
