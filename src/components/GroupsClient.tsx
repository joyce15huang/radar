"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X, Trash2, ChevronDown, UsersRound, Pencil, Check } from "lucide-react";
import {
  createGroup,
  deleteGroup,
  renameGroup,
  addGroupMember,
  removeGroupMember,
  type GroupWithMembers,
} from "@/app/group-actions";

export function GroupsClient({ groups }: { groups: GroupWithMembers[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creating || !name.trim()) return;
    setCreating(true);
    setError(null);
    const res = await createGroup(name);
    setCreating(false);
    if (!res.ok) return setError(res.error ?? "Couldn't create the group.");
    setName("");
    if (res.groupId) setOpen((prev) => new Set(prev).add(res.groupId!));
    router.refresh();
  }

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        Groups
        <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {groups.length}
        </span>
      </h2>

      <form onSubmit={create} className="mb-3 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New group — e.g. Thursday Hoops"
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New
        </button>
      </form>
      {error && <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-200 bg-white/50 px-4 py-8 text-center dark:border-neutral-800 dark:bg-neutral-900/40">
          <UsersRound className="h-6 w-6 text-neutral-300 dark:text-neutral-600" strokeWidth={2} />
          <p className="text-sm text-neutral-400 dark:text-neutral-500">
            No groups yet. Make a private roster to invite in one tap.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              open={open.has(g.id)}
              onToggle={() => toggle(g.id)}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GroupCard({
  group,
  open,
  onToggle,
  onChanged,
}: {
  group: GroupWithMembers;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Something went wrong.");
    onChanged();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await addGroupMember(group.id, handle);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't add.");
    setHandle("");
    onChanged();
  }

  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2 p-3">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setEditing(false);
              if (name.trim() && name.trim() !== group.name) run(() => renameGroup(group.id, name));
            }}
            className="flex flex-1 items-center gap-2"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            />
            <button type="submit" aria-label="Save name" className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <Check className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-2 text-left">
            <UsersRound className="h-4 w-4 shrink-0 text-neutral-400" />
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{group.name}</span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {group.members.length} {group.members.length === 1 ? "person" : "people"}
            </span>
            <ChevronDown className={`ml-auto h-4 w-4 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
        {!editing && (
          <>
            <button
              type="button"
              onClick={() => {
                setName(group.name);
                setEditing(true);
              }}
              aria-label="Rename group"
              className="rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => run(() => deleteGroup(group.id))}
              disabled={busy}
              aria-label="Delete group"
              className="rounded-full p-1.5 text-neutral-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-60 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="border-t border-neutral-100 p-3 dark:border-neutral-800">
          {group.members.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {group.members.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  {m.username ? `@${m.username}` : m.email}
                  <button
                    type="button"
                    onClick={() => run(() => removeGroupMember(group.id, m.id))}
                    aria-label={`Remove ${m.username || m.email}`}
                    className="text-neutral-400 hover:text-rose-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="mb-2 text-xs text-neutral-400 dark:text-neutral-500">No one in this group yet.</p>
          )}

          <form onSubmit={add} className="flex items-center gap-2">
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@username to add"
              className="w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            />
            <button
              type="submit"
              disabled={busy || !handle.trim()}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
          </form>
          {error && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
