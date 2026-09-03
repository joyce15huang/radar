"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import type { Ride } from "@/lib/carpool";

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

/** Is the actor allowed to see/use this event's carpool (host or on the guest list)? */
async function onGuestList(
  admin: Admin,
  eventId: string,
  actorId: string,
): Promise<boolean> {
  const { data: ev } = await admin.from("events").select("creator_id").eq("id", eventId).maybeSingle();
  if ((ev?.creator_id as string | undefined) === actorId) return true;
  const { data: mine } = await admin
    .from("cards")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", actorId)
    .limit(1);
  return !!mine && mine.length > 0;
}

export async function listRides(eventId: string): Promise<Ride[]> {
  const actor = await getActor();
  if (!actor) return [];
  const admin = createAdminClient();
  if (!(await onGuestList(admin, eventId, actor.actorId))) return [];

  const { data: rides } = await admin
    .from("event_rides")
    .select("id, driver_id, seats, note, passenger_ids, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  const rows = rides ?? [];

  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.driver_id as string);
    ((r.passenger_ids as string[] | null) ?? []).forEach((p) => ids.add(p));
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

  return rows.map((r) => {
    const passengerIds = ((r.passenger_ids as string[] | null) ?? []).filter(
      (p) => p !== r.driver_id,
    );
    const passengers = passengerIds.map((pid) => ({ id: pid, name: nameById.get(pid) ?? "Someone" }));
    return {
      id: r.id as string,
      driverId: r.driver_id as string,
      driverName: nameById.get(r.driver_id as string) ?? "Someone",
      seats: r.seats as number,
      note: (r.note as string | null) ?? null,
      passengers,
      seatsLeft: Math.max(0, (r.seats as number) - passengers.length),
      isMine: r.driver_id === actor.actorId,
      iAmIn: passengers.some((p) => p.id === actor.actorId),
    };
  });
}

export interface RideResult {
  ok: boolean;
  error?: string;
}

export async function offerRide(input: {
  eventId: string;
  seats: number;
  note?: string;
}): Promise<RideResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  if (!(await onGuestList(admin, input.eventId, actor.actorId)))
    return { ok: false, error: "You're not on this event." };

  const seats = Math.max(1, Math.min(20, Math.round(input.seats || 1)));
  const { error } = await admin.from("event_rides").insert({
    event_id: input.eventId,
    driver_id: actor.actorId,
    seats,
    note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/event/${input.eventId}`);
  return { ok: true };
}

export async function deleteRide(rideId: string): Promise<RideResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();
  const { data: ride } = await admin
    .from("event_rides")
    .select("id, event_id, driver_id")
    .eq("id", rideId)
    .maybeSingle();
  if (!ride) return { ok: false, error: "That ride is gone." };
  if (ride.driver_id !== actor.actorId) return { ok: false, error: "That's not your ride." };
  await admin.from("event_rides").delete().eq("id", rideId);
  revalidatePath(`/event/${ride.event_id as string}`);
  return { ok: true };
}

/** Claim (join=true) or give up (join=false) a seat — always only for the caller. */
export async function setSeat(rideId: string, join: boolean): Promise<RideResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "You're not signed in." };
  const admin = createAdminClient();

  const { data: ride } = await admin
    .from("event_rides")
    .select("id, event_id, driver_id, seats, passenger_ids")
    .eq("id", rideId)
    .maybeSingle();
  if (!ride) return { ok: false, error: "That ride is gone." };
  if (!(await onGuestList(admin, ride.event_id as string, actor.actorId)))
    return { ok: false, error: "You're not on this event." };
  if (ride.driver_id === actor.actorId) return { ok: false, error: "You're the driver of this ride." };

  const current = ((ride.passenger_ids as string[] | null) ?? []).filter(
    (id) => id !== ride.driver_id,
  );
  let next = current;
  if (join) {
    if (current.includes(actor.actorId)) return { ok: true };
    if (current.length >= (ride.seats as number)) return { ok: false, error: "That ride is full." };
    next = [...current, actor.actorId];
  } else {
    next = current.filter((id) => id !== actor.actorId);
  }

  const { error } = await admin.from("event_rides").update({ passenger_ids: next }).eq("id", rideId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/event/${ride.event_id as string}`);
  return { ok: true };
}
