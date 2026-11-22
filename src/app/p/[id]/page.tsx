import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getActor } from "@/lib/actor";
import { getOpenPost, markPostRead } from "@/app/open-post-actions";
import { OpenPostItem } from "@/components/open/OpenPostItem";
import { ConvertPanel, DeletePost, PostThreadBox } from "@/components/open/PostThreadBox";

/** One open post. The poster sees who saved it and each private thread; anyone else, their thread with the poster. */
export default async function OpenPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=/p/${id}`);
  const data = await getOpenPost(id);
  if (!data) notFound();
  await markPostRead(id).catch(() => {});
  const { post, ended, threads } = data;
  const savers = threads.filter((t) => t.saved);

  return (
    <main className="min-h-dvh bg-linen">
      <div className="mx-auto max-w-xl px-5 pb-16 pt-3 sm:px-6">
        <div className="flex h-12 items-center border-b border-neutral-200">
          <Link href="/today" aria-label="Back to Today" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full">
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </Link>
        </div>

        <OpenPostItem post={post} linkBody={false} divider={false} />
        {ended && <p className="pb-2 text-[13px] text-neutral-500">This post has ended.</p>}

        {post.mine ? (
          <>
            {!post.plan && !ended && <ConvertPanel postId={post.id} savers={savers.length} />}
            <section className="border-t border-neutral-200 pt-3">
              <h2 className="text-[13px] font-bold text-neutral-500">
                {savers.length} saved{threads.length > savers.length ? ` · ${threads.length - savers.length} wrote` : ""}
              </h2>
              {threads.length === 0 && <p className="py-3 text-[14px] text-neutral-500">Nobody yet. People who save or message show up here.</p>}
              <div className="divide-y divide-neutral-200">
                {threads.map((t) => (
                  <PostThreadBox
                    key={t.withId}
                    postId={post.id}
                    toId={t.withId}
                    title={t.withName}
                    hint={t.saved ? "Saved it" : undefined}
                    messages={t.messages}
                    open={!ended}
                  />
                ))}
              </div>
            </section>
            <div className="pt-6">
              <DeletePost postId={post.id} />
            </div>
          </>
        ) : (
          <section id="message" className="scroll-mt-4 border-t border-neutral-200">
            {threads.map((t) => (
              <PostThreadBox
                key={t.withId}
                postId={post.id}
                title={`Message ${t.withName}`}
                hint={`Only ${t.withName} sees this`}
                messages={t.messages}
                open={!ended}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
