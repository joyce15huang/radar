"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Mail, UserRound } from "lucide-react";
import { respondToInvite, type InboxInvite } from "@/app/inbox-actions";
import { acceptFriend, declineFriend } from "@/app/friends-actions";
import type { FriendRequestEntry } from "@/lib/friends";

const TONES = ["bg-fuchsia-700 text-white", "bg-amber-500 text-neutral-900", "bg-sky-500 text-neutral-900", "bg-violet-600 text-white"];

function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function InboxClient({ invites, requests }: { invites: InboxInvite[]; requests: FriendRequestEntry[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const hide = (key: string) => setGone((g) => new Set(g).add(key));
  const liveInvites = invites.filter((i) => !gone.has(i.cardId));
  const liveRequests = requests.filter((r) => !gone.has(`fr:${r.id}`));

  async function answerInvite(inv: InboxInvite, accept: boolean) {
    setBusy(inv.cardId);
    const res = await respondToInvite(inv.cardId, accept);
    setBusy(null);
    if (!res.ok) return;
    hide(inv.cardId);
    router.refresh();
    if (accept && res.eventId) router.push(`/event/${res.eventId}`);
  }

  async function answerRequest(r: FriendRequestEntry, accept: boolean) {
    setBusy(`fr:${r.id}`);
    const res = accept ? await acceptFriend(r.id) : await declineFriend(r.id);
    setBusy(null);
    if (res.ok) {
      hide(`fr:${r.id}`);
      router.refresh();
    }
  }

  if (liveInvites.length === 0 && liveRequests.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-[22px] bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(80,50,35,0.06)]">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100">
          <Mail className="h-6 w-6 text-neutral-500" />
        </span>
        <p className="text-[17px] font-semibold text-neutral-900">You&rsquo;re all caught up</p>
        <p className="mt-1 text-sm text-neutral-600">Event invites and friend requests show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {liveInvites.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="px-1 text-[13px] font-semibold text-neutral-500">Event invites</h2>
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-[20px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.06)]">
            {liveInvites.map((inv, i) => (
              <li key={inv.cardId} className="flex items-start gap-3 p-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold uppercase ${TONES[i % TONES.length]}`}>
                  {inv.senderName.replace(/^@/, "").slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  {inv.isFriend ? (
                    <Link href={inv.eventId ? `/event/${inv.eventId}` : "#"} className="block">
                      <p className="text-[15px] leading-snug text-neutral-800">
                        <span className="font-semibold text-neutral-900">{inv.senderName}</span> invited you to{" "}
                        <span className="font-semibold text-neutral-900">{inv.title}</span>
                      </p>
                      {(inv.when || inv.location) && (
                        <p className="mt-0.5 truncate text-[13px] text-neutral-500">
                          {[inv.when, inv.location].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </Link>
                  ) : (
                    <>
                      <p className="text-[15px] leading-snug text-neutral-800">
                        <span className="font-semibold text-neutral-900">{inv.senderName}</span> sent you an event invite
                      </p>
                      <p className="mt-0.5 text-[13px] text-neutral-500">Not on your friends list · accept to see the details</p>
                    </>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => answerInvite(inv, true)}
                      disabled={busy === inv.cardId}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-fuchsia-700 px-3.5 text-[13px] font-semibold text-white transition hover:bg-fuchsia-800 disabled:opacity-60"
                    >
                      {busy === inv.cardId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" strokeWidth={2.6} />}
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => answerInvite(inv, false)}
                      disabled={busy === inv.cardId}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-neutral-200 px-3.5 text-[13px] font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.6} /> Decline
                    </button>
                    <span className="ml-auto text-[12px] text-neutral-400">{ago(inv.createdAt)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {liveRequests.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="px-1 text-[13px] font-semibold text-neutral-500">Friend requests</h2>
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-[20px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.06)]">
            {liveRequests.map((r) => {
              const key = `fr:${r.id}`;
              return (
                <li key={r.id} className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                    <UserRound className="h-5 w-5 text-neutral-500" />
                  </span>
                  <Link href={`/u/${r.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-neutral-900">{r.username ? `@${r.username}` : r.name}</p>
                    <p className="text-[13px] text-neutral-500">wants to be friends</p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => answerRequest(r, true)}
                    disabled={busy === key}
                    aria-label="Accept"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-white disabled:opacity-60"
                  >
                    {busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.6} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => answerRequest(r, false)}
                    disabled={busy === key}
                    aria-label="Decline"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 disabled:opacity-60"
                  >
                    <X className="h-4 w-4" strokeWidth={2.6} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
