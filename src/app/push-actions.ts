"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";

const NEEDS_0050 = "Notifications need database migration 0050 — run it in Supabase.";

/** Remember this device's push subscription for the signed-in person. */
export async function savePushSubscription(sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }): Promise<{ ok: boolean; error?: string }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = sub?.keys?.p256dh ?? "";
  const auth = sub?.keys?.auth ?? "";
  let host = "";
  try {
    const u = new URL(endpoint);
    host = u.protocol === "https:" ? u.hostname : "";
  } catch {}
  if (!host || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return { ok: false, error: "That browser didn't give a usable subscription." };
  }
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert({ endpoint, user_id: actor.actorId, p256dh, auth }, { onConflict: "endpoint" });
  return error ? { ok: false, error: NEEDS_0050 } : { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const actor = await getActor();
  if (!actor || typeof endpoint !== "string") return;
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", actor.actorId);
}
