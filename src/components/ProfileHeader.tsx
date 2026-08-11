import { Globe, AtSign, BadgeCheck, CalendarCheck2, Building2, Users } from "lucide-react";
import { initials } from "@/lib/cardTypes";

export interface ProfileHeaderData {
  name: string;
  kind: "person" | "org" | "group";
  verified: boolean;
  bio: string | null;
  avatarUrl: string | null;
  links: { website?: string; instagram?: string; twitter?: string };
  hostedEvents: number;
  postCount: number;
}

export function ProfileHeader({ data }: { data: ProfileHeaderData }) {
  const isHost = data.kind === "org" || data.kind === "group";

  return (
    <header className="mb-6">
      <div className="flex items-start gap-4">
        {/* Avatar (hosts get an accent ring) */}
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full ${
            isHost ? "ring-2 ring-offset-2 ring-violet-400 ring-offset-neutral-50 dark:ring-offset-neutral-950" : ""
          } bg-neutral-900 text-lg font-semibold text-white dark:bg-white dark:text-neutral-900`}
        >
          {data.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.avatarUrl} alt={data.name} className="h-full w-full object-cover" />
          ) : (
            initials(data.name)
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              {data.name}
            </h1>
            {data.verified && <BadgeCheck className="h-5 w-5 text-sky-500" aria-label="Verified" />}
            {isHost && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200/70 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20">
                {data.kind === "org" ? <Building2 className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {data.kind === "org" ? "Organization" : "Group"}
              </span>
            )}
          </div>

          {data.bio && (
            <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{data.bio}</p>
          )}

          {/* External links (borrowed credibility) */}
          {(data.links.website || data.links.instagram || data.links.twitter) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {data.links.website && (
                <LinkChip href={data.links.website} icon={<Globe className="h-3.5 w-3.5" />} label={hostname(data.links.website)} />
              )}
              {data.links.instagram && (
                <LinkChip href={`https://instagram.com/${data.links.instagram}`} icon={<AtSign className="h-3.5 w-3.5" />} label={`${data.links.instagram} · IG`} />
              )}
              {data.links.twitter && (
                <LinkChip href={`https://x.com/${data.links.twitter}`} icon={<AtSign className="h-3.5 w-3.5" />} label={`${data.links.twitter} · X`} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Track record */}
      <div className="mt-4 flex gap-5 border-t border-neutral-200/70 pt-3 text-sm dark:border-neutral-800">
        {isHost && (
          <span className="inline-flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
            <CalendarCheck2 className="h-4 w-4 text-neutral-400" />
            <span className="font-semibold text-neutral-900 dark:text-neutral-50">{data.hostedEvents}</span>
            {data.hostedEvents === 1 ? "event hosted" : "events hosted"}
          </span>
        )}
        <span className="text-neutral-600 dark:text-neutral-300">
          <span className="font-semibold text-neutral-900 dark:text-neutral-50">{data.postCount}</span>{" "}
          {data.postCount === 1 ? "post" : "posts"}
        </span>
      </div>
    </header>
  );
}

function LinkChip({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-white"
    >
      {icon}
      {label}
    </a>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}
