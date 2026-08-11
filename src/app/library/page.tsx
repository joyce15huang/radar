import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountBar } from "@/components/AccountBar";
import { TabNav } from "@/components/TabNav";
import { ProfileTabs } from "@/components/ProfileTabs";
import { LibraryWall } from "@/components/LibraryWall";
import { rowToCard, CARD_SELECT, type CardRow } from "@/lib/cardMapping";
import type { DigestCardData } from "@/lib/types";

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("cards")
    .select(CARD_SELECT)
    .eq("user_id", user.id)
    .eq("status", "saved")
    .order("created_at", { ascending: false });

  const cards = (rows ?? [])
    .map((r) => rowToCard(r as CardRow))
    .filter((c): c is DigestCardData => c !== null);

  return (
    <main className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto min-h-dvh max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <AccountBar email={user.email} link={{ href: "/profile", label: "Settings" }} />
        <TabNav />
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Library
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Everything you&rsquo;ve saved — a calm wall you can return to anytime.
          </p>
        </header>
        <ProfileTabs />
        <LibraryWall initial={cards} />
      </div>
    </main>
  );
}
