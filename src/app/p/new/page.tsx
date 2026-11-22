import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { OpenComposer } from "@/components/open/OpenComposer";

export default async function NewOpenPostPage({ searchParams }: { searchParams: Promise<{ text?: string; day?: string }> }) {
  const sp = await searchParams;
  const actor = await getActor();
  if (!actor) redirect("/login?next=/p/new");
  const name = actor.activeProfile.username ?? actor.activeProfile.displayName ?? "you";
  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto max-w-xl px-5 sm:px-6">
        <OpenComposer
          meId={actor.actorId}
          meName={name}
          initialBody={(sp.text ?? "").slice(0, 300)}
          initialDay={/^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") ? sp.day : undefined}
        />
      </div>
    </main>
  );
}
