import Link from "next/link";
import { redirect } from "next/navigation";
import { BellOff, ChevronRight, Lock, Megaphone, UserPlus } from "lucide-react";
import { getActor } from "@/lib/actor";
import { TabNav } from "@/components/TabNav";
import { listChats, type ChatRow } from "@/app/chat-list-actions";
import { inboxCount } from "@/app/inbox-actions";
import { serverTimeZone } from "@/lib/tz";
import { initials } from "@/lib/cardTypes";

const card = "rounded-[18px] bg-white shadow-[0_8px_24px_rgba(80,50,35,0.07)]";

function when(iso: string, tz: string): string {
  const t = Date.parse(iso);
  const day = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: tz });
  if (day(t) === day(Date.now())) return new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  if (Date.now() - t < 6 * 86_400_000) return new Date(t).toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
}

const href = (r: ChatRow) => `/chat/${r.eventId}${r.peerId ? `?with=${r.peerId}` : ""}`;

/** Chats: every plan's group chat and your private threads, plus requests waiting on you. */
export default async function ChatsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/chats");
  const [rows, requests, tz] = await Promise.all([listChats(), inboxCount(), serverTimeZone()]);
  const open = rows.filter((r) => !r.closed);
  const closed = rows.filter((r) => r.closed && r.count > 0).slice(0, 20);

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
        <TabNav />
        <h1 className="mb-4 text-[30px] font-bold leading-tight tracking-tight text-neutral-900">Chats</h1>

        {requests > 0 && (
          <Link href="/inbox" className="mb-4 flex items-center gap-3 rounded-2xl bg-fuchsia-100 px-3.5 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
              <UserPlus className="h-[18px] w-[18px] text-fuchsia-800" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-fuchsia-900">
                {requests} {requests === 1 ? "request" : "requests"}
              </span>
              <span className="block text-[13px] font-medium text-fuchsia-800">Friend requests and invites from new people</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-fuchsia-800" />
          </Link>
        )}

        {open.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-center text-[14px] text-neutral-500">
            No chats yet. Each plan with other people gets one — it closes two days after the plan.
          </p>
        ) : (
          <ul className={`${card} divide-y divide-neutral-100`}>
            {open.map((r) => (
              <li key={`${r.eventId}:${r.peerId ?? "group"}`}>
                <Link href={href(r)} className="flex items-center gap-3 px-3.5 py-3 transition hover:bg-neutral-50">
                  <Avatar r={r} tz={tz} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[15px] ${r.unread ? "font-bold" : "font-semibold"} text-neutral-900`}>
                      {r.peerId ? r.peerName : r.planTitle}
                      {(r.peerId || r.teamName) && (
                        <span className="font-medium text-neutral-500"> · {r.peerId ? r.planTitle : r.teamName}</span>
                      )}
                    </span>
                    <span
                      className={`flex items-center gap-1.5 truncate text-[13px] ${
                        r.last?.announcement ? "font-semibold text-fuchsia-800" : r.unread ? "text-neutral-700" : "text-neutral-500"
                      }`}
                    >
                      {r.last?.announcement && <Megaphone className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">
                        {r.last ? `${r.peerId && r.last.author !== "You" ? "" : `${r.last.author}: `}${r.last.body}` : "No messages yet"}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {r.last && <span className="text-[12px] font-medium text-neutral-500">{when(r.last.at, tz)}</span>}
                    {r.unread > 0 && (
                      <span
                        aria-label={`${r.unread} unread`}
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-fuchsia-700 px-1.5 text-[11px] font-bold text-white"
                      >
                        {r.unread > 99 ? "99+" : r.unread}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {closed.length > 0 && (
          <section className="mt-6 space-y-2">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-neutral-500">Closed · kept with the plan</h2>
            <ul className="space-y-2">
              {closed.map((r) => (
                <li key={`${r.eventId}:${r.peerId ?? "group"}`}>
                  <Link href={href(r)} className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
                      <Lock className="h-[15px] w-[15px] text-neutral-500" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-neutral-600">
                        {r.peerId ? `${r.peerName} · ${r.planTitle}` : r.planTitle}
                      </span>
                      <span className="block text-[13px] text-neutral-500">
                        {r.startsAt ? `${new Date(r.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })} · ` : ""}
                        {r.count} {r.count === 1 ? "message" : "messages"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-neutral-500">
          <BellOff className="h-3.5 w-3.5" /> Chats don&rsquo;t send notifications yet — new messages show here.
        </p>
      </div>
    </main>
  );
}

function Avatar({ r, tz }: { r: ChatRow; tz: string }) {
  if (r.peerId) {
    return (
      <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-violet-600 text-[15px] font-bold text-white">
        {initials(r.peerName ?? "?")}
      </span>
    );
  }
  if (r.teamName) {
    return (
      <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] bg-neutral-900 text-[13px] font-bold text-white">
        {initials(r.teamName)}
      </span>
    );
  }
  const d = r.startsAt ? new Date(r.startsAt) : null;
  return (
    <span className="flex h-[46px] w-[46px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-neutral-200">
      <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-600">
        {d ? d.toLocaleDateString("en-US", { month: "short", timeZone: tz }) : ""}
      </span>
      <span className="text-[17px] font-bold leading-none text-neutral-900">
        {d ? d.toLocaleDateString("en-US", { day: "numeric", timeZone: tz }) : "·"}
      </span>
    </span>
  );
}
