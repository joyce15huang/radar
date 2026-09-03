"use client";

import { useCallback, useEffect, useState } from "react";
import { Receipt, Plus, Loader2, X, Trash2, Pencil, ArrowRight } from "lucide-react";
import {
  listLedger,
  addLineItem,
  editLineItem,
  deleteLineItem,
  type LedgerData,
  type LedgerItem,
} from "@/app/expense-actions";

function money(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** Per-event expense ledger: add items, see who owes whom (netted). */
export function LedgerSection({ eventId }: { eventId: string }) {
  const [data, setData] = useState<LedgerData | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LedgerItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    listLedger(eventId)
      .then(setData)
      .catch(() => setData({ people: [], items: [], debts: [] }));
  }, [eventId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function remove(itemId: string) {
    if (busyId) return;
    setBusyId(itemId);
    await deleteLineItem(itemId);
    setBusyId(null);
    reload();
  }

  const closeForm = () => {
    setAdding(false);
    setEditing(null);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Expenses
        </h2>
        {!adding && !editing && data && data.people.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add expense
          </button>
        )}
      </div>

      {(adding || editing) && data && (
        <AddForm
          eventId={eventId}
          people={data.people}
          item={editing ?? undefined}
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
          {/* Settlement summary */}
          {data.items.length > 0 && (
            <div className="border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
              {data.debts.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">All square — nobody owes anyone.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.debts.map((d, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span
                        className={
                          d.fromIsMe || d.toIsMe
                            ? "font-medium text-neutral-900 dark:text-neutral-50"
                            : "text-neutral-600 dark:text-neutral-300"
                        }
                      >
                        {d.fromIsMe ? "You" : d.fromName}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-neutral-400" />
                      <span
                        className={
                          d.fromIsMe || d.toIsMe
                            ? "font-medium text-neutral-900 dark:text-neutral-50"
                            : "text-neutral-600 dark:text-neutral-300"
                        }
                      >
                        {d.toIsMe ? "you" : d.toName}
                      </span>
                      <span className="ml-auto font-semibold text-neutral-900 dark:text-neutral-50">
                        {money(d.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Line items */}
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
            {data.items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    <Receipt className="h-4 w-4 shrink-0 text-neutral-400" />
                    {it.description}
                    <span className="font-normal text-neutral-400">·</span>
                    <span>{money(it.amountCents)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    paid by {it.payerName} · split {it.sharedBy.length} way
                    {it.sharedBy.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-neutral-400 dark:text-neutral-500">
                    {it.participantNames.join(", ")}
                  </p>
                </div>
                {it.isMine && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(it);
                        setAdding(false);
                      }}
                      aria-label="Edit expense"
                      className="rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(it.id)}
                      disabled={busyId === it.id}
                      aria-label="Remove expense"
                      className="rounded-full p-1.5 text-neutral-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-60 dark:hover:bg-rose-500/10"
                    >
                      {busyId === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                )}
              </li>
            ))}

            {data.items.length === 0 && !adding && (
              <li className="px-4 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
                No expenses yet. Add what you paid and pick who shares it.
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

function AddForm({
  eventId,
  people,
  item,
  onDone,
  onCancel,
}: {
  eventId: string;
  people: { id: string; name: string }[];
  item?: LedgerItem;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(item?.description ?? "");
  const [amount, setAmount] = useState(item ? String(item.amountCents / 100) : "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(item ? item.sharedBy : people.map((p) => p.id)),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

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
    const amt = parseFloat(amount);
    if (!description.trim()) {
      setError("What was it for?");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter an amount.");
      return;
    }
    if (selected.size === 0) {
      setError("Pick who shares it.");
      return;
    }
    setPending(true);
    setError(null);
    const res = item
      ? await editLineItem({
          itemId: item.id,
          description: description.trim(),
          amountCents: Math.round(amt * 100),
          sharedBy: [...selected],
        })
      : await addLineItem({
          eventId,
          description: description.trim(),
          amountCents: Math.round(amt * 100),
          sharedBy: [...selected],
        });
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
      <div className="flex items-end gap-2">
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">What for</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Rental car" className={inputCls} />
        </label>
        <label className="block w-24">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Amount $</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="120" className={inputCls} />
        </label>
      </div>

      <p className="mb-1.5 mt-3 text-xs font-medium text-neutral-500 dark:text-neutral-400">Split between</p>
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
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
          {item ? "Save" : "Add"}
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
