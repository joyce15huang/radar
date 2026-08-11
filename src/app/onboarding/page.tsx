import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { UsernameForm } from "@/components/UsernameForm";

/**
 * First-run gate: pick a username. Reached automatically (via middleware) right
 * after a new user signs in, before they can use the app. If they already have a
 * username, bounce home.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.username) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            <Sparkles className="h-6 w-6" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Choose your username
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            One quick thing before your first deck — this is the handle friends use to add you.
          </p>
        </div>
        <UsernameForm mode="onboarding" />
      </div>
    </main>
  );
}
