"use client";

import { useEffect, useRef, useState } from "react";
import { searchProfiles } from "@/app/poll-actions";
import { X, Users } from "lucide-react";
import type { FriendOption } from "@/lib/friends";

/**
 * Instagram-style recipient picker: type to filter your accepted friends by
 * @username, pick from the dropdown, and each choice becomes a removable chip.
 * Friends come first; typing 2+ letters also finds other people on the app
 * ("Not friends yet") — their invite waits in the recipient's Inbox.
 */
export function FriendPicker({
  friends,
  selected,
  onChange,
}: {
  friends: FriendOption[];
  selected: FriendOption[];
  onChange: (next: FriendOption[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedIds = new Set(selected.map((f) => f.id));
  const q = query.trim().toLowerCase().replace(/^@/, "");
  const available = friends
    .filter((f) => !selectedIds.has(f.id))
    .filter((f) => (q ? f.username.toLowerCase().includes(q) : true))
    .sort((a, b) => a.username.localeCompare(b.username));

  // Other people on the app matching the query (not friends, not already picked).
  const [others, setOthers] = useState<FriendOption[]>([]);
  useEffect(() => {
    if (q.length < 2) {
      setOthers([]);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      const res = await searchProfiles(q).catch(() => []);
      if (!live) return;
      const friendIds = new Set(friends.map((f) => f.id));
      setOthers(
        res
          .filter((m) => m.username && !friendIds.has(m.id))
          .map((m) => ({ id: m.id, username: m.username, email: m.email })),
      );
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, friends]);
  const strangers = others.filter((o) => !selectedIds.has(o.id));
  const friendIdSet = new Set(friends.map((f) => f.id));
  const options = [...available, ...strangers];

  const showList = focused && options.length > 0;
  const showNoMatch = focused && options.length === 0 && q.length > 1;

  function add(f: FriendOption) {
    onChange([...selected, f]);
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }
  function removeAt(i: number) {
    const next = [...selected];
    next.splice(i, 1);
    onChange(next);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      const pick = options[highlight];
      if (pick) {
        e.preventDefault();
        add(pick);
      }
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      removeAt(selected.length - 1);
    }
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
        To
      </span>

      {/* Tag-style input box */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-[2.75rem] flex-wrap items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-2 py-1.5 transition focus-within:border-neutral-400 focus-within:ring-2 focus-within:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:focus-within:ring-neutral-700"
      >
        {selected.map((f, i) => (
          <span
            key={f.id}
            className="inline-flex items-center gap-1 rounded-full bg-neutral-100 py-1 pl-2.5 pr-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            @{f.username}
            {!friendIdSet.has(f.id) && <span className="text-neutral-400">· not a friend</span>}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(i);
              }}
              aria-label={`Remove @${f.username}`}
              className="rounded-full p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-700"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={selected.length === 0 ? "Search friends or @username…" : ""}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed dark:text-neutral-100 dark:placeholder:text-neutral-600"
        />
      </div>


      {showList && (
        <ul className="mt-1.5 max-h-48 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {options.map((f, i) => (
            <li key={f.id}>
              {i === available.length && (
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  Not friends yet
                </p>
              )}
              <button
                type="button"
                // onMouseDown fires before the input's onBlur, so the pick lands
                // before the dropdown closes.
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(f);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  i === highlight
                    ? "bg-neutral-100 dark:bg-neutral-800"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200">
                  {f.username.slice(0, 2).toUpperCase()}
                </span>
                <span className="font-medium text-neutral-800 dark:text-neutral-100">
                  @{f.username}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showNoMatch && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
          <Users className="h-3.5 w-3.5" />
          No one matches &ldquo;{query}&rdquo;.
        </p>
      )}
    </div>
  );
}
