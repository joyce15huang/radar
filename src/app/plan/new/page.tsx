import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { PlanComposer } from "@/components/PlanComposer";

/** New plan: private (just you) or with friends — one composer for both. */
export default async function NewPlanPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/plan/new");
  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto max-w-xl px-4 sm:px-6">
        <PlanComposer />
      </div>
    </main>
  );
}
