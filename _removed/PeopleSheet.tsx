"use client";

import { X } from "lucide-react";
import { PeopleTabs } from "./PeopleTabs";
import type { FriendEntry, FriendRequestEntry } from "@/lib/friends";
import type { GroupWithMembers } from "@/app/group-actions";

type Tab = "friends" | "requests" | "groups";

/** Bottom-sheet / modal that opens from the profile's Friends / Groups buttons
 *  and holds the friends management panel (Friends / Requests / Groups). */
export function PeopleSheet({
  friends,
  requests,
  groups,
  initialTab,
  onClose,
}: {
  friends: FriendEntry[];
  requests: FriendRequestEntry[];
  groups: GroupWithMembers[];
  initialTab: Tab;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-neutral-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Friends</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <PeopleTabs friends={friends} requests={requests} groups={groups} initialTab={initialTab} />
      </div>
    </div>
  );
}
