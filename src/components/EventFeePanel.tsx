"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { setFeePaid } from "@/app/event-actions";

/** Integer cents → "$40" / "$16.67". */
function money(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function venmoUrl(handle: string, feeCents: number, note: string): string {
  const amount = (feeCents / 100).toFixed(2);
  const params = new URLSearchParams({ txn: "pay", amount });
  if (note) params.set("note", note);
  return `https://venmo.com/${handle}?${params.toString()}`;
}

/**
 * Compact fee line folded into the event header: the amount to join, the
 * attendee's manual "Mark as paid" tap, and the host's Venmo / Zelle handles.
 * No card framing — it sits inline under the event's when/where/host meta.
 * No real money is moved.
 */
export function EventFeePanel({
  cardId,
  feeCents,
  venmoId,
  zelleId,
  paymentLink,
  feePaid,
  isHost,
  note = "",
}: {
  cardId?: string;
  feeCents: number;
  venmoId: string | null;
  zelleId: string | null;
  paymentLink: string | null;
  feePaid: boolean;
  isHost: boolean;
  note?: string;
}) {
  const [paid, setPaid] = useState(feePaid);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  if (feeCents <= 0) return null;

  const legacyHref =
    !venmoId && !zelleId && paymentLink
      ? /^https?:\/\//i.test(paymentLink)
        ? paymentLink
        : `https://${paymentLink}`
      : null;

  async function toggle() {
    if (!cardId || pending) return;
    const next = !paid;
    setPaid(next);
    setPending(true);
    const res = await setFeePaid(cardId, next);
    setPending(false);
    if (!res.ok) setPaid(!next);
  }

  async function copyZelle() {
    if (!zelleId) return;
    try {
      await navigator.clipboard.writeText(zelleId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the id is still visible to type manually */
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800">
      <span className="text-neutral-600 dark:text-neutral-300">
        <span className="font-semibold text-neutral-900 dark:text-neutral-50">{money(feeCents)}</span> to join
      </span>

      {!isHost && (
        <button
          type="button"
          onClick={toggle}
          disabled={pending || !cardId}
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${
            paid
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"
              : "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          }`}
        >
          {paid ? (
            <>
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Paid
            </>
          ) : (
            "Mark as paid"
          )}
        </button>
      )}

      {!isHost && venmoId && (
        <a
          href={venmoUrl(venmoId, feeCents, note)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-[#008CFF] px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110"
        >
          Pay on Venmo <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {zelleId && (
        <button
          type="button"
          onClick={copyZelle}
          className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Copied Zelle
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Zelle: {zelleId}
            </>
          )}
        </button>
      )}

      {isHost && venmoId && (
        <span className="text-xs text-neutral-400 dark:text-neutral-500">Venmo @{venmoId}</span>
      )}

      {legacyHref && !isHost && (
        <a
          href={legacyHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-fuchsia-600 hover:underline dark:text-fuchsia-400"
        >
          Pay the host <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
