import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountBar } from "@/components/AccountBar";
import { PreferencesForm } from "@/components/PreferencesForm";
import { UsernameForm } from "@/components/UsernameForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: prefs }, { data: profile }] = await Promise.all([
    supabase.from("preferences").select("locations").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
  ]);

  const initialLocations: string[] = Array.isArray(prefs?.locations) ? prefs.locations : [];
  const username: string = typeof profile?.username === "string" ? profile.username : "";

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <AccountBar email={user.email} link={{ href: "/", label: "Back to feed" }} />

        <section className="mb-8">
          <header className="mb-3">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Your username
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              How friends find and add you. Change it any time.
            </p>
          </header>
          <UsernameForm mode="settings" initialUsername={username} />
        </section>

        <section>
          <header className="mb-3">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Where are you?
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Add your cities and your deck rebuilds on the spot.
            </p>
          </header>
          <PreferencesForm initialLocations={initialLocations} />
        </section>
      </div>
    </main>
  );
}
