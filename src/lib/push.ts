// Server-only: send Web Push notifications. Quietly does nothing until the
// VAPID keys are set and migration 0050 has run.
import webpush from "web-push";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is tapped (same-site path). */
  url: string;
  /** Same tag replaces the earlier notification instead of stacking. */
  tag?: string;
}

let configured: boolean | null = null;
function ready(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://www.blipclub.app", pub, priv);
    return (configured = true);
  } catch {
    return (configured = false);
  }
}

async function send(userIds: string[], payload: PushPayload): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length || !ready()) return;
  const admin = createAdminClient();
  const { data, error } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", ids);
  if (error || !data?.length) return;
  const body = JSON.stringify({
    title: payload.title.slice(0, 80),
    body: payload.body.slice(0, 180),
    url: payload.url.startsWith("/") ? payload.url : "/",
    tag: payload.tag,
  });
  const gone: string[] = [];
  await Promise.allSettled(
    data.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          body,
          { TTL: 3600, timeout: 5000 },
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint as string);
      }
    }),
  );
  if (gone.length) await admin.from("push_subscriptions").delete().in("endpoint", gone);
}

/** Send after the response is out, so the person acting never waits on it. */
export function notify(userIds: string[], payload: PushPayload): void {
  try {
    after(() => send(userIds, payload).catch(() => {}));
  } catch {
    void send(userIds, payload).catch(() => {});
  }
}
