"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import type { EventTask, TaskAssignee, TaskData } from "@/lib/tasks";

type Admin = ReturnType<typeof createAdminClient>;

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || email
  );
}

/** Host or on the guest list? Returns { ok, ids } where ids = the guest list. */
async function guestList(
  admin: Admin,
  eventId: string,
  actorId: string,
): Promise<{ ok: boolean; ids: string[] }> {
  const { data: ev } = await admin.from("events").select("creator_id").eq("id", eventId).maybeSingle();
  const creator = (ev?.creator_id as string | undefined) ?? undefined;
  const { data: cards } = await admin
    .from("cards")
    .select("user_id, status")
    .eq("event_id", eventId)
    .eq("type", "social_invite");
  const ids = new Set<string>();
  if (creator) ids.add(creator);
  for (const c of cards ?? []) {
    if (c.status !== "dismissed") ids.add(c.user_id as string);
  }
  return { ok: ids.has(actorId), ids: [...ids] };
}

function cleanIds(ids: string[], allowed: Set<string>): string[] {
  return [...new Set(ids)].filter((id) => allowed.has(id));
}

export async function listTasks(eventId: string): Promise<TaskData> {
  const empty: TaskData = { people: [], tasks: [] };
  const actor = await getActor();
  if (!actor) return empty;
  const admin = createAdminClient();
  const gate = await guestList(admin, eventId, actor.actorId);
  if (!gate.ok) return empty;

  const { data: taskRows } = await admin
    .from("event_tasks")
    .select("id, title, created_by, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  const tasks = taskRows ?? [];
  const taskIds = tasks.map((t) => t.id as string);

  const assigneesByTask = new Map<string, { profileId: string; done: boolean }[]>();
  const involved = new Set<string>(gate.ids);
  if (taskIds.length > 0) {
    const { data: aRows } = await admin
      .from("event_task_assignees")
      .select("task_id, profile_id, done")
      .in("task_id", taskIds);
    for (const a of aRows ?? []) {
      const tid = a.task_id as string;
      const arr = assigneesByTask.get(tid) ?? [];
      arr.push({ profileId: a.profile_id as string, done: a.done as boolean });
      assigneesByTask.set(tid, arr);
      involved.add(a.profile_id as string);
    }
  }

  const nameById = new Map<string, string>();
  if (involved.size > 0) {
    const { data: profs } = await admin.from("profiles").select("id, username, email").in("id", [...involved]);
    for (const p of profs ?? []) {
      const username = (p.username as string) || "";
      const email = (p.email as string) || "";
      nameById.set(p.id as string, username ? `@${username}` : nameFromEmail(email));
    }
  }
  const nameOf = (id: string) => nameById.get(id) ?? "Someone";

  const people = gate.ids
    .map((id) => ({ id, name: nameOf(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const outTasks: EventTask[] = tasks.map((t) => {
    const raw = assigneesByTask.get(t.id as string) ?? [];
    const assignees: TaskAssignee[] = raw
      .map((a) => ({ id: a.profileId, name: nameOf(a.profileId), done: a.done, isMe: a.profileId === actor.actorId }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const total = assignees.length;
    const doneCount = assignees.filter((a) => a.done).length;
    const mine = assignees.find((a) => a.isMe);
    return {
      id: t.id as string,
      title: t.title as string,
      createdBy: t.created_by as string,
      isMine: t.created_by === actor.actorId,
      assignees,
      total,
      doneCount,
      allDone: total > 0 && doneCount === total,
      assignedToMe: !!mine,
      myDone: !!mine?.done,
    };
  });

  return { people, tasks: outTasks };
}

export interface TaskResult {
  ok: boolean;
  error?: string;
}

export async function addTask(
  eventId: string,
  title: string,
  assigneeIds: string[] = [],
): Promise<TaskResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const gate = await guestList(admin, eventId, actor.actorId);
  if (!gate.ok) return { ok: false, error: "You're not on this event." };
  const clean = title.trim();
  if (!clean) return { ok: false, error: "Name the task." };

  const { data: inserted, error } = await admin
    .from("event_tasks")
    .insert({ event_id: eventId, created_by: actor.actorId, title: clean })
    .select("id")
    .maybeSingle();
  if (error || !inserted) return { ok: false, error: error?.message ?? "Couldn't add that." };

  const ids = cleanIds(assigneeIds, new Set(gate.ids));
  if (ids.length > 0) {
    await admin
      .from("event_task_assignees")
      .insert(ids.map((pid) => ({ task_id: inserted.id as string, profile_id: pid })));
  }
  revalidatePath(`/event/${eventId}`);
  return { ok: true };
}

/** Poster-only: rename + reset the assignee set (keeps done state for kept people). */
export async function updateTask(
  taskId: string,
  title: string,
  assigneeIds: string[],
): Promise<TaskResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("event_tasks")
    .select("id, event_id, created_by")
    .eq("id", taskId)
    .maybeSingle();
  if (!t) return { ok: false, error: "That task is gone." };
  if (t.created_by !== actor.actorId) return { ok: false, error: "Only who added it can edit it." };
  const clean = title.trim();
  if (!clean) return { ok: false, error: "Name the task." };

  const gate = await guestList(admin, t.event_id as string, actor.actorId);
  const wanted = new Set(cleanIds(assigneeIds, new Set(gate.ids)));

  await admin.from("event_tasks").update({ title: clean }).eq("id", taskId);

  const { data: existing } = await admin
    .from("event_task_assignees")
    .select("profile_id")
    .eq("task_id", taskId);
  const have = new Set((existing ?? []).map((r) => r.profile_id as string));
  const toAdd = [...wanted].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !wanted.has(id));
  if (toAdd.length > 0) {
    await admin
      .from("event_task_assignees")
      .insert(toAdd.map((pid) => ({ task_id: taskId, profile_id: pid })));
  }
  if (toRemove.length > 0) {
    await admin.from("event_task_assignees").delete().eq("task_id", taskId).in("profile_id", toRemove);
  }
  revalidatePath(`/event/${t.event_id as string}`);
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<TaskResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("event_tasks")
    .select("id, event_id, created_by")
    .eq("id", taskId)
    .maybeSingle();
  if (!t) return { ok: false, error: "That task is gone." };
  if (t.created_by !== actor.actorId) return { ok: false, error: "Only who added it can remove it." };
  await admin.from("event_tasks").delete().eq("id", taskId);
  revalidatePath(`/event/${t.event_id as string}`);
  return { ok: true };
}

/** Add or remove YOURSELF as an assignee (opt in to an open task / opt out). */
export async function claimTask(taskId: string, claim: boolean): Promise<TaskResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: t } = await admin.from("event_tasks").select("id, event_id").eq("id", taskId).maybeSingle();
  if (!t) return { ok: false, error: "That task is gone." };
  const gate = await guestList(admin, t.event_id as string, actor.actorId);
  if (!gate.ok) return { ok: false, error: "You're not on this event." };
  if (claim) {
    await admin
      .from("event_task_assignees")
      .upsert({ task_id: taskId, profile_id: actor.actorId }, { onConflict: "task_id,profile_id", ignoreDuplicates: true });
  } else {
    await admin.from("event_task_assignees").delete().eq("task_id", taskId).eq("profile_id", actor.actorId);
  }
  revalidatePath(`/event/${t.event_id as string}`);
  return { ok: true };
}

/** Toggle YOUR OWN done for a task you're assigned to. */
export async function setMyDone(taskId: string, done: boolean): Promise<TaskResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: t } = await admin.from("event_tasks").select("id, event_id").eq("id", taskId).maybeSingle();
  if (!t) return { ok: false, error: "That task is gone." };
  const { data: row } = await admin
    .from("event_task_assignees")
    .select("task_id")
    .eq("task_id", taskId)
    .eq("profile_id", actor.actorId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Claim it first to check it off." };
  const { error } = await admin
    .from("event_task_assignees")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("task_id", taskId)
    .eq("profile_id", actor.actorId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/event/${t.event_id as string}`);
  return { ok: true };
}
