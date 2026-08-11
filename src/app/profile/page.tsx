import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountBar } from "@/components/AccountBar";
import { SettingsPanel } from "@/components/SettingsPanel";
import type { ProfileInitial } from "@/components/ProfileForm";

type Kind = "person" | "org" | "group";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: prefs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("kind, display_name, bio, links")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("preferences")
      .select("standing_prompt, weekly_prompt")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const links = (profile?.links ?? {}) as { website?: string; instagram?: string; twitter?: string };
  const profileInitial: ProfileInitial = {
    displayName: profile?.display_name ?? "",
    bio: profile?.bio ?? "",
    website: links.website ?? "",
    instagram: links.instagram ?? "",
    twitter: links.twitter ?? "",
  };

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <AccountBar email={user.email} link={{ href: "/", label: "Back to feed" }} />

        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Settings
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Your account type and its settings.
          </p>
        </header>

        <SettingsPanel
          initialKind={(profile?.kind as Kind) ?? "person"}
          profileInitial={profileInitial}
          prefsInitial={{
            standingPrompt: prefs?.standing_prompt ?? "",
            weeklyPrompt: prefs?.weekly_prompt ?? "",
          }}
        />
      </div>
    </main>
  );
}
