"use client";

import { useCallback, useEffect, useState } from "react";
import { Car, Plus, Loader2, X, Check, Trash2, UserRound } from "lucide-react";
import { listRides, offerRide, deleteRide, setSeat } from "@/app/carpool-actions";
import type { Ride } from "@/lib/carpool";

/** Carpool board for the event page: offer a ride with seats, claim a seat. */
export function CarpoolSection({ eventId }: { eventId: string }) {
  const [rides, setRides] = useState<Ride[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    listRides(eventId)
      .then(setRides)
      .catch(() => setRides([]));
  }, [eventId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function seat(rideId: string, join: boolean) {
    if (busyId) return;
    setBusyId(rideId);
    await setSeat(rideId, join);
    setBusyId(null);
    reload();
  }

  async function remove(rideId: string) {
    if (busyId) return;
    setBusyId(rideId);
    await deleteRide(rideId);
    setBusyId(null);
    reload();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Carpool
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <Plus className="h-3.5 w-3.5" /> Offer a ride
          </button>
        )}
      </div>

      <div className="space-y-2">
        {adding && <OfferForm eventId={eventId} onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}

        {rides === null ? (
          <div className="h-16 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-neutral-200/70 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
              {rides.length === 0 && !adding && (
                <li className="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
                  No rides yet — offer one if you&rsquo;re driving.
                </li>
              )}
              {rides.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                    <Car className="h-4 w-4 text-neutral-400" />
                    {r.driverName}
                    <span className="font-normal text-neutral-400">driving</span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {r.seatsLeft} of {r.seats} seat{r.seats === 1 ? "" : "s"} open
                  </p>
                  {r.note && (
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{r.note}</p>
                  )}
                  {r.passengers.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                      <UserRound className="h-3.5 w-3.5 text-neutral-400" />
                      {r.passengers.map((p) => p.name).join(", ")}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  {r.isMine ? (
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      disabled={busyId === r.id}
                      aria-label="Delete ride"
                      className="rounded-full p-1.5 text-neutral-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-60 dark:hover:bg-rose-500/10"
                    >
                      {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  ) : r.iAmIn ? (
                    <button
                      type="button"
                      onClick={() => seat(r.id, false)}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 transition hover:bg-emerald-100 disabled:opacity-60 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"
                    >
                      {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                      In
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => seat(r.id, true)}
                      disabled={busyId === r.id || r.seatsLeft === 0}
                      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                    >
                      {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {r.seatsLeft === 0 ? "Full" : "Claim seat"}
                    </button>
                  )}
                </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function OfferForm({
  eventId,
  onDone,
  onCancel,
}: {
  eventId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [seats, setSeats] = useState("3");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const n = parseInt(seats, 10);
    if (!Number.isFinite(n) || n < 1) {
      setError("How many seats?");
      return;
    }
    setPending(true);
    setError(null);
    const res = await offerRide({ eventId, seats: n, note: note.trim() || undefined });
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't add that ride.");
      return;
    }
    onDone();
  }

  const inputCls =
    "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-end gap-2">
        <label className="block w-20">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Seats</span>
          <input value={seats} onChange={(e) => setSeats(e.target.value)} inputMode="numeric" className={inputCls} />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Note (optional)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="leaving from the Mission at 6"
            className={inputCls}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Car className="h-4 w-4" />}
          Offer ride
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
