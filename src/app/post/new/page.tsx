import Link from "next/link";
import { redirect } from "next/navigation";
import { X } from "lucide-react";
import { getActor } from "@/lib/actor";
import { PostCompose } from "@/components/explore/PostCompose";

export default async function NewPostPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/post/new");
  const { data: me } = await actor.supabase.from("profiles").select("verified").eq("id", actor.actorId).maybeSingle();

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
        <div className="mb-3 flex h-12 items-center gap-1">
          <Link
            href="/today"
            aria-label="Close"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-200/60"
          >
            <X className="h-5 w-5" strokeWidth={2.4} />
          </Link>
          <h1 className="text-[17px] font-bold text-neutral-900">New post</h1>
        </div>
        <PostCompose canPostPublic={!!me?.verified} />
      </div>
    </main>
  );
}
