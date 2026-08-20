import { redirect } from "next/navigation";
import { AccountBar } from "@/components/AccountBar";
import { SettingsPanel } from "@/components/SettingsPanel";
import type { ProfileInitial } from "@/components/ProfileForm";
import { getActor } from "@/lib/actor";
import { listMyProfiles } from "@/app/persona-actions";

export default async function SettingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { supabase, actorId } = actor;

  const [{ data: profile }, { data: prefs }, personas] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, bio, links")
      .eq("id", actorId)
      .maybeSingle(),
    supabase
      .from("preferences")
      .select("locations")
      .eq("user_id", actorId)
      .maybeSingle(),
    listMyProfiles(),
  ]);

  const links = (profile?.links ?? {}) as { website?: string; instagram?: string };
  const profileInitial: ProfileInitial = {
    displayName: profile?.display_name ?? "",
    bio: profile?.bio ?? "",
    website: links.website ?? "",
    instagram: links.instagram ?? "",
  };

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <AccountBar email={actor.userEmail ?? undefined} link={{ href: "/", label: "Back to feed" }} />

        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Settings
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Switch profiles, set your locations, and edit your public profile.
          </p>
        </header>

        <SettingsPanel
          personas={personas}
          profileInitial={profileInitial}
          prefsInitial={{ locations: (prefs?.locations as string[] | null) ?? [] }}
        />
      </div>
    </main>
  );
}
