// Server-only: the set of profile ids someone is ACCEPTED friends with.
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export async function friendIdSet(admin: Admin, me: string): Promise<Set<string>> {
  try {
    const { data, error } = await admin
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
    if (error) return new Set();
    return new Set(
      (data ?? []).map((r) => (r.requester_id === me ? (r.addressee_id as string) : (r.requester_id as string))),
    );
  } catch {
    return new Set();
  }
}

/**
 * An invite you received from someone you're NOT friends with — it waits in
 * the Inbox as a request (no event details) instead of landing on Today or
 * Calendar. Broadcasts (people you follow) and your own events don't count.
 */
export function isStrangerInvite(
  row: { type: string; status: string; sender_id: string | null; content?: Record<string, unknown> | null },
  me: string,
  friends: Set<string>,
): boolean {
  if (row.type !== "social_invite" || row.status !== "pending") return false;
  if (!row.sender_id || row.sender_id === me) return false;
  if ((row.content as Record<string, unknown> | null)?.broadcast === "true") return false;
  return !friends.has(row.sender_id);
}
