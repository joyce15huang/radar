"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckSquare,
  Square,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  X,
  Check,
  ChevronDown,
  Users,
} from "lucide-react";
import {
  listTasks,
  addTask,
  updateTask,
  deleteTask,
  claimTask,
  setMyDone,
} from "@/app/task-actions";
import type { EventTask, TaskData, TaskPerson } from "@/lib/tasks";

/** Task delegation: each task is assigned to a subset of guests; everyone marks
 *  their own copy done. Progress shows as a count you can expand. */
export function TaskSection({ eventId }: { eventId: string }) {
  const [data, setData] = useState<TaskData | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EventTask | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    listTasks(eventId)
      .then(setData)
      .catch(() => setData({ people: [], tasks: [] }));
  }, [eventId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function run(id: string, fn: () => Promise<unknown>) {
    if (busyId) return;
    setBusyId(id);
    await fn();
    setBusyId(null);
    reload();
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const closeForm = () => {
    setAdding(false);
    setEditing(null);
  };

  const people = data?.people ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Tasks
        </h2>
        {!adding && !editing && people.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add task
          </button>
        )}
      </div>

      {(adding || editing) && data && (
        <TaskForm
          eventId={eventId}
          people={people}
          task={editing ?? undefined}
          onDone={() => {
            closeForm();
            reload();
          }}
          onCancel={closeForm}
        />
      )}

      {data === null ? (
        <div className="h-16 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200/70 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
          {data.tasks.map((t) => {
            const open = t.total === 0;
            const isOpen = expanded.has(t.id);
            const meta =
              open
                ? "Unassigned"
                : t.total === 1
                  ? `${t.assignees[0].name}${t.assignees[0].done ? " · done" : ""}`
                  : `${t.doneCount} of ${t.total} done`;
            return (
              <li key={t.id} className="px-3 py-3">
                <div className="flex items-center gap-2.5">
                  {/* My own done checkbox (only if I'm assigned) */}
                  {t.assignedToMe ? (
                    <button
                      type="button"
                      onClick={() => run(t.id, () => setMyDone(t.id, !t.myDone))}
                      disabled={busyId === t.id}
                      aria-label={t.myDone ? "Mark mine not done" : "Mark mine done"}
                      className="shrink-0 text-neutral-400 transition hover:text-neutral-700 disabled:opacity-60 dark:hover:text-neutral-200"
                    >
                      {busyId === t.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : t.myDone ? (
                        <CheckSquare className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>
                  ) : (
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded ${
                        t.allDone ? "text-emerald-500" : "text-neutral-300 dark:text-neutral-600"
                      }`}
                    >
                      {t.allDone ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => t.total > 1 && toggleExpand(t.id)}
                    className={`min-w-0 flex-1 text-left ${t.total > 1 ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <p
                      className={`truncate text-sm ${
                        t.allDone
                          ? "text-neutral-400 line-through dark:text-neutral-500"
                          : "text-neutral-800 dark:text-neutral-100"
                      }`}
                    >
                      {t.title}
                    </p>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                      {t.total > 1 && <Users className="h-3 w-3" />}
                      {meta}
                      {t.total > 1 && (
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      )}
                    </span>
                  </button>

                  {/* Opt in to an open task */}
                  {open && (
                    <button
                      type="button"
                      onClick={() => run(t.id, () => claimTask(t.id, true))}
                      disabled={busyId === t.id}
                      className="shrink-0 rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      I&rsquo;ll do it
                    </button>
                  )}

                  {t.isMine && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(t);
                          setAdding(false);
                        }}
                        aria-label="Edit task"
                        className="shrink-0 rounded-full p-1 text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => run(t.id, () => deleteTask(t.id))}
                        disabled={busyId === t.id}
                        aria-label="Remove task"
                        className="shrink-0 rounded-full p-1 text-neutral-300 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-60 dark:text-neutral-600 dark:hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Per-person breakdown */}
                {isOpen && t.total > 1 && (
                  <ul className="mt-2 space-y-1 border-t border-neutral-100 pl-7 pt-2 dark:border-neutral-800">
                    {t.assignees.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-xs">
                        {a.isMe ? (
                          <button
                            type="button"
                            onClick={() => run(t.id, () => setMyDone(t.id, !a.done))}
                            disabled={busyId === t.id}
                            className="inline-flex items-center gap-1.5 text-neutral-500 transition hover:text-neutral-800 disabled:opacity-60 dark:text-neutral-400 dark:hover:text-neutral-100"
                          >
                            {a.done ? (
                              <CheckSquare className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                            <span className="font-medium">You</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                            {a.done ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <span className="h-3.5 w-3.5 rounded-full border border-neutral-300 dark:border-neutral-600" />
                            )}
                            {a.name}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}

          {data.tasks.length === 0 && !adding && (
            <li className="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
              Nothing to do yet — add a task and pick who it&rsquo;s for.
            </li>
          )}
        </ul>
        </div>
      )}
    </section>
  );
}

function TaskForm({
  eventId,
  people,
  task,
  onDone,
  onCancel,
}: {
  eventId: string;
  people: TaskPerson[];
  task?: EventTask;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(task ? task.assignees.map((a) => a.id) : []),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

  const allOn = people.length > 0 && selected.size === people.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!title.trim()) {
      setError("Name the task.");
      return;
    }
    setPending(true);
    setError(null);
    const res = task
      ? await updateTask(task.id, title.trim(), [...selected])
      : await addTask(eventId, title.trim(), [...selected]);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't save that.");
      return;
    }
    onDone();
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Task</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Bring your own sleeping bag"
          className={inputCls}
        />
      </label>

      <div className="mb-1.5 mt-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          For whom{" "}
          <span className="font-normal text-neutral-400 dark:text-neutral-500">
            (empty = anyone can claim)
          </span>
        </span>
        <button
          type="button"
          onClick={() => setSelected(allOn ? new Set() : new Set(people.map((p) => p.id)))}
          className="shrink-0 text-xs font-medium text-neutral-500 underline-offset-2 hover:underline dark:text-neutral-400"
        >
          {allOn ? "Clear" : "Everyone"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {people.map((p) => {
          const on = selected.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                on
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "border border-neutral-200 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {task ? "Save" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </form>
  );
}
