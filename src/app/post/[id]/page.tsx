import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getActor } from "@/lib/actor";
import { getDatePost } from "@/app/date-post-actions";
import { PostDetail } from "@/components/explore/PostDetail";
import { serverTimeZone } from "@/lib/tz";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=/post/${id}`);
  const [post, tz] = await Promise.all([getDatePost(id), serverTimeZone()]);
  if (!post) notFound();

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto min-h-dvh max-w-xl px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
        <div className="mb-2 flex h-12 items-center">
          <Link
            href="/today"
            aria-label="Back to Today"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-200/60"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </Link>
        </div>
        <PostDetail post={post} tz={tz} />
      </div>
    </main>
  );
}
