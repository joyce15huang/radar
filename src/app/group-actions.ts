"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { lookupRecipient } from "@/app/poll-actions";

type Admin = ReturnType<typeof createAdminClient>;

export interface GroupMember {
  id: string;
  username: string;
  email: string;
}
export interface GroupWithMembers {
  id: string;
  name: string;
  members: GroupMember[];
}
export interface GroupResult {
  ok: boolean;
  error?: string;
  groupId?: string;
}

/** Confirm the actor owns the group; returns the owner id or null. */
async function ownsGroup(admin: Admin, groupId: string, actorId: string): Promise<boolean> {
  const { data } = await admin.from("contact_groups").select("owner_id").eq("id", groupId).maybeSingle();
  return !!data && data.owner_id === actorId;
}

export async function createGroup(name: string): Promise<GroupResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Name the group." };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contact_groups")
    .insert({ owner_id: actor.actorId, name: clean })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the group." };
  revalidatePath("/me");
  return { ok: true, groupId: data.id as string };
}

export async function renameGroup(groupId: string, name: string): Promise<GroupResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Name the group." };
  const admin = createAdminClient();
  if (!(await ownsGroup(admin, groupId, actor.actorId))) return { ok: false, error: "That's not your group." };
  const { error } = await admin.from("contact_groups").update({ name: clean }).eq("id", groupId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  return { ok: true, groupId };
}

export async function deleteGroup(groupId: string): Promise<GroupResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  if (!(await ownsGroup(admin, groupId, actor.actorId))) return { ok: false, error: "That's not your group." };
  await admin.from("contact_groups").delete().eq("id", groupId);
  revalidatePath("/me");
  return { ok: true };
}

export async function addGroupMember(groupId: string, handleOrId: string): Promise<GroupResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  if (!(await ownsGroup(admin, groupId, actor.actorId))) return { ok: false, error: "That's not your group." };
  const match = await lookupRecipient(handleOrId);
  if (!match) return { ok: false, error: `No one on the app matches "${handleOrId.trim()}".` };
  const { error } = await admin
    .from("group_members")
    .upsert({ group_id: groupId, member_id: match.id }, { onConflict: "group_id,member_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/me");
  return { ok: true, groupId };
}

export async function removeGroupMember(groupId: string, memberId: string): Promise<GroupResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  if (!(await ownsGroup(admin, groupId, actor.actorId))) return { ok: false, error: "That's not your group." };
  await admin.from("group_members").delete().eq("group_id", groupId).eq("member_id", memberId);
  revalidatePath("/me");
  return { ok: true, groupId };
}

/** The actor's groups with their members (for management + audience picking). */
export async function listMyGroups(): Promise<GroupWithMembers[]> {
  const actor = await getActor();
  if (!actor) return [];
  const admin = createAdminClient();
  const { data: groups } = await admin
    .from("contact_groups")
    .select("id, name, created_at")
    .eq("owner_id", actor.actorId)
    .order("created_at", { ascending: true });
  const groupList = groups ?? [];
  if (groupList.length === 0) return [];

  const groupIds = groupList.map((g) => g.id as string);
  const { data: memberRows } = await admin
    .from("group_members")
    .select("group_id, member_id")
    .in("group_id", groupIds);

  const memberIds = [...new Set((memberRows ?? []).map((r) => r.member_id as string))];
  const nameById = new Map<string, GroupMember>();
  if (memberIds.length > 0) {
    const { data: profs } = await admin.from("profiles").select("id, username, email").in("id", memberIds);
    for (const p of profs ?? []) {
      nameById.set(p.id as string, {
        id: p.id as string,
        username: (p.username as string) ?? "",
        email: (p.email as string) ?? "",
      });
    }
  }

  const byGroup = new Map<string, GroupMember[]>();
  for (const r of memberRows ?? []) {
    const gid = r.group_id as string;
    const m = nameById.get(r.member_id as string);
    if (!m) continue;
    const arr = byGroup.get(gid) ?? [];
    arr.push(m);
    byGroup.set(gid, arr);
  }

  return groupList.map((g) => ({
    id: g.id as string,
    name: g.name as string,
    members: (byGroup.get(g.id as string) ?? []).sort((a, b) => a.username.localeCompare(b.username)),
  }));
}
