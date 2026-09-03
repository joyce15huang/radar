"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { computeSettlement, type LineItem } from "@/lib/ledger";

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

export interface LedgerPerson {
  id: string;
  name: string;
}
export interface LedgerItem {
  id: string;
  description: string;
  amountCents: number;
  postedBy: string;
  payerName: string;
  sharedBy: string[];
  participantNames: string[];
  isMine: boolean;
}
export interface LedgerDebt {
  from: string;
  to: string;
  amountCents: number;
  fromName: string;
  toName: string;
  fromIsMe: boolean;
  toIsMe: boolean;
}
export interface LedgerData {
  people: LedgerPerson[];
  items: LedgerItem[];
  debts: LedgerDebt[];
}

export async function listLedger(eventId: string): Promise<LedgerData> {
  const empty: LedgerData = { people: [], items: [], debts: [] };
  const actor = await getActor();
  if (!actor) return empty;
  const admin = createAdminClient();
  const gate = await guestList(admin, eventId, actor.actorId);
  if (!gate.ok) return empty;

  const { data: rows } = await admin
    .from("event_line_items")
    .select("id, posted_by, description, amount_cents, shared_by, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  const items = rows ?? [];

  // Resolve every id we might display (guest list + payers + participants).
  const ids = new Set<string>(gate.ids);
  for (const it of items) {
    ids.add(it.posted_by as string);
    ((it.shared_by as string[] | null) ?? []).forEach((p) => ids.add(p));
  }
  const nameById = new Map<string, string>();
  if (ids.size > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, username, email")
      .in("id", [...ids]);
    for (const p of profs ?? []) {
      const username = (p.username as string) || "";
      const email = (p.email as string) || "";
      nameById.set(p.id as string, username ? `@${username}` : nameFromEmail(email));
    }
  }
  const nameOf = (id: string) => nameById.get(id) ?? "Someone";

  const people: LedgerPerson[] = gate.ids
    .map((id) => ({ id, name: nameOf(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const ledgerItems: LedgerItem[] = items.map((it) => {
    const sharedBy = ((it.shared_by as string[] | null) ?? []) as string[];
    return {
      id: it.id as string,
      description: it.description as string,
      amountCents: it.amount_cents as number,
      postedBy: it.posted_by as string,
      payerName: nameOf(it.posted_by as string),
      sharedBy,
      participantNames: sharedBy.map(nameOf),
      isMine: it.posted_by === actor.actorId,
    };
  });

  const settleInput: LineItem[] = items.map((it) => ({
    id: it.id as string,
    postedBy: it.posted_by as string,
    description: it.description as string,
    amountCents: it.amount_cents as number,
    sharedBy: ((it.shared_by as string[] | null) ?? []) as string[],
  }));
  const debts: LedgerDebt[] = computeSettlement(settleInput).map((d) => ({
    ...d,
    fromName: nameOf(d.from),
    toName: nameOf(d.to),
    fromIsMe: d.from === actor.actorId,
    toIsMe: d.to === actor.actorId,
  }));

  return { people, items: ledgerItems, debts };
}

export interface LedgerResult {
  ok: boolean;
  error?: string;
}

export async function addLineItem(input: {
  eventId: string;
  description: string;
  amountCents: number;
  sharedBy: string[];
}): Promise<LedgerResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const gate = await guestList(admin, input.eventId, actor.actorId);
  if (!gate.ok) return { ok: false, error: "You're not on this event." };

  const description = input.description.trim();
  if (!description) return { ok: false, error: "What was it for?" };
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0)
    return { ok: false, error: "Enter an amount." };

  // Only real guest-list members can be billed.
  const allowed = new Set(gate.ids);
  const sharedBy = [...new Set(input.sharedBy)].filter((id) => allowed.has(id));
  if (sharedBy.length === 0) return { ok: false, error: "Pick who shares it." };

  const { error } = await admin.from("event_line_items").insert({
    event_id: input.eventId,
    posted_by: actor.actorId,
    description,
    amount_cents: Math.round(input.amountCents),
    shared_by: sharedBy,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/event/${input.eventId}`);
  return { ok: true };
}

export async function editLineItem(input: {
  itemId: string;
  description: string;
  amountCents: number;
  sharedBy: string[];
}): Promise<LedgerResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: item } = await admin
    .from("event_line_items")
    .select("id, event_id, posted_by")
    .eq("id", input.itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "That item is gone." };
  if (item.posted_by !== actor.actorId) return { ok: false, error: "Only who added it can edit it." };

  const description = input.description.trim();
  if (!description) return { ok: false, error: "What was it for?" };
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0)
    return { ok: false, error: "Enter an amount." };

  const gate = await guestList(admin, item.event_id as string, actor.actorId);
  const allowed = new Set(gate.ids);
  const sharedBy = [...new Set(input.sharedBy)].filter((id) => allowed.has(id));
  if (sharedBy.length === 0) return { ok: false, error: "Pick who shares it." };

  const { error } = await admin
    .from("event_line_items")
    .update({ description, amount_cents: Math.round(input.amountCents), shared_by: sharedBy })
    .eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/event/${item.event_id as string}`);
  return { ok: true };
}

export async function deleteLineItem(itemId: string): Promise<LedgerResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: item } = await admin
    .from("event_line_items")
    .select("id, event_id, posted_by")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "That item is gone." };
  if (item.posted_by !== actor.actorId) return { ok: false, error: "Only who added it can remove it." };
  await admin.from("event_line_items").delete().eq("id", itemId);
  revalidatePath(`/event/${item.event_id as string}`);
  return { ok: true };
}
