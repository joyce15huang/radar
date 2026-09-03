"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";

type Admin = ReturnType<typeof createAdminClient>;

const OPTIONAL = new Set(["carpool", "expenses", "tasks"]);

export interface ModuleResult {
  ok: boolean;
  error?: string;
}

/** Returns the event's current modules if the actor is its host, else null. */
async function hostModules(
  admin: Admin,
  eventId: string,
  actorId: string,
): Promise<string[] | null> {
  const { data: ev } = await admin
    .from("events")
    .select("creator_id, modules")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev || ev.creator_id !== actorId) return null;
  return ((ev.modules as string[] | null) ?? []) as string[];
}

export async function addEventModule(eventId: string, module: string): Promise<ModuleResult> {
  if (!OPTIONAL.has(module)) return { ok: false, error: "Unknown section." };
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const modules = await hostModules(admin, eventId, actor.actorId);
  if (!modules) return { ok: false, error: "Only the host can change sections." };
  if (modules.includes(module)) return { ok: true };

  const { error } = await admin
    .from("events")
    .update({ modules: [...modules, module] })
    .eq("id", eventId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/event/${eventId}`);
  return { ok: true };
}

/** Host-only: set the full list of enabled optional sections at once. */
export async function setEventModules(eventId: string, next: string[]): Promise<ModuleResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const modules = await hostModules(admin, eventId, actor.actorId);
  if (!modules) return { ok: false, error: "Only the host can change sections." };

  const clean = [...new Set(next)].filter((m) => OPTIONAL.has(m));
  const { error } = await admin.from("events").update({ modules: clean }).eq("id", eventId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/event/${eventId}`);
  return { ok: true };
}

export async function removeEventModule(eventId: string, module: string): Promise<ModuleResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const modules = await hostModules(admin, eventId, actor.actorId);
  if (!modules) return { ok: false, error: "Only the host can change sections." };
  if (!modules.includes(module)) return { ok: true };

  const { error } = await admin
    .from("events")
    .update({ modules: modules.filter((m) => m !== module) })
    .eq("id", eventId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/event/${eventId}`);
  return { ok: true };
}
