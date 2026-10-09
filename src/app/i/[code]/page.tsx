import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, MapPin, Crown } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActor } from "@/lib/actor";
import { eventForCode } from "@/lib/inviteLinks";
import { joinViaInvite } from "@/app/invite-link-actions";
import { formatWhen } from "@/lib/localDateTime";
import { APP_TZ } from "@/lib/time";

type Params = { params: Promise<{ code: string }> };

async function load(code: string) {
  const admin = createAdminClient();
  const ev = await eventForCode(admin, code);
  if (!ev) return null;
  const [{ data: host }, { count }] = await Promise.all([
    admin.from("profiles").select("username, display_name").eq("id", ev.creator_id).maybeSingle(),
    admin
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("event_id", ev.id)
      .eq("status", "accepted"),
  ]);
  const hostName = host?.display_name || (host?.username ? `@${host.username}` : "A friend");
  return { ev, hostName, going: count ?? 0 };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const data = await load(code);
  if (!data) return { title: "Invite" };
  return {
    title: `${data.ev.title ?? "You're invited"} · Digest`,
    description: `${data.hostName} invited you${data.ev.event_time ? ` — ${data.ev.event_time}` : ""}.`,
  };
}

/** Public landing for a short invite link. Works signed out: new people sign up, then join. */
export default async function InviteLinkPage({ params }: Params) {
  const { code } = await params;
  const data = await load(code);
  const actor = await getActor();

  if (!data) {
    return (
      <Shell>
        <h1 className="text-[24px] font-bold tracking-tight text-neutral-900">This invite link doesn&rsquo;t work</h1>
        <p className="mt-2 text-[15px] text-neutral-600">It may have been mistyped, or the event was removed.</p>
        <Link href="/calendar" className="mt-6 inline-flex h-12 items-center rounded-2xl bg-neutral-900 px-5 text-[15px] font-semibold text-white">
          Open the app
        </Link>
      </Shell>
    );
  }

  const { ev, hostName, going } = data;
  const when = ev.event_time || (ev.starts_at ? formatWhen(ev.starts_at, APP_TZ, false) : "");
  const next = `/i/${code}`;
  const join = joinViaInvite.bind(null, code);

  return (
    <Shell>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-fuchsia-800">
        <Crown className="h-4 w-4" /> {hostName} invited you
      </p>
      <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-tight text-neutral-900">{ev.title}</h1>

      <div className="mt-5 divide-y divide-neutral-100 rounded-2xl bg-white shadow-[0_8px_24px_rgba(80,50,35,0.08)]">
        {when && (
          <p className="flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium text-neutral-800">
            <CalendarDays className="h-5 w-5 text-neutral-500" /> {when}
          </p>
        )}
        {ev.location && (
          <p className="flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium text-neutral-800">
            <MapPin className="h-5 w-5 text-neutral-500" /> {ev.location}
          </p>
        )}
      </div>
      {ev.note && <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-700">{ev.note}</p>}
      {going > 0 && <p className="mt-4 text-[13px] font-medium text-neutral-500">{going} going</p>}

      <div className="mt-8 space-y-3">
        {actor ? (
          <form action={join}>
            <button
              type="submit"
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-fuchsia-700 text-[16px] font-semibold text-white shadow-[0_10px_24px_rgba(181,82,74,0.25)] transition hover:bg-fuchsia-800"
            >
              I&rsquo;m going
            </button>
          </form>
        ) : (
          <>
            <Link
              href={`/login?mode=signup&next=${encodeURIComponent(next)}`}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-fuchsia-700 text-[16px] font-semibold text-white shadow-[0_10px_24px_rgba(181,82,74,0.25)] transition hover:bg-fuchsia-800"
            >
              Sign up to join
            </Link>
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-semibold text-neutral-700 transition hover:bg-neutral-100"
            >
              I already have an account
            </Link>
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-linen px-5 pb-16 pt-16 sm:items-center sm:pt-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
