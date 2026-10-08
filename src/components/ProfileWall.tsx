"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2, ImageOff, Images, X, CalendarClock } from "lucide-react";
import { deletePost } from "@/app/post-actions";
import { EmptyState } from "./LibraryWall";
import { PhotoGallery } from "./PhotoGallery";

export interface ProfilePost {
  id: string;
  /** All photos on the post — one renders plain, several become a swipeable gallery. */
  imageUrls: string[];
  caption: string | null;
  createdAt: string;
  /** The date the moment happened (host-picked); falls back to createdAt. */
  takenOn?: string | null;
  eventTitle?: string | null;
  eventId?: string | null;
}

/** Instagram-style profile grid: square thumbnails, tap to open the full post. */
export function ProfileWall({ posts, isOwner }: { posts: ProfilePost[]; isOwner: boolean }) {
  const [items, setItems] = useState(posts);
  const [active, setActive] = useState<ProfilePost | null>(null);

  const remove = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    setActive((a) => (a?.id === id ? null : a));
    void deletePost(id);
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ImageOff className="h-7 w-7" strokeWidth={2} />}
        title={isOwner ? "No posts yet" : "Nothing posted yet"}
        body={
          isOwner
            ? "Tap the + button, choose Post, and share a photo. It'll live here on your profile."
            : "This person hasn't posted anything yet."
        }
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {items.map((p) => (
          <GridCell key={p.id} post={p} onOpen={() => setActive(p)} />
        ))}
      </div>
      {active && (
        <PostDetail
          post={active}
          isOwner={isOwner}
          onClose={() => setActive(null)}
          onDelete={() => remove(active.id)}
        />
      )}
    </>
  );
}

function GridCell({ post, onOpen }: { post: ProfilePost; onOpen: () => void }) {
  const cover = post.imageUrls[0];
  const multi = post.imageUrls.length > 1;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-square overflow-hidden rounded-md bg-neutral-100"
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt={post.caption ?? "Post"} className="h-full w-full object-cover transition group-active:scale-[0.98]" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-neutral-300">
          <ImageOff className="h-6 w-6" />
        </span>
      )}
      {multi && (
        <Images className="absolute right-1.5 top-1.5 h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" strokeWidth={2.5} />
      )}
    </button>
  );
}

function PostDetail({
  post,
  isOwner,
  onClose,
  onDelete,
}: {
  post: ProfilePost;
  isOwner: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const date = formatDate(post.takenOn || post.createdAt);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-400">{date}</span>
          <div className="flex items-center gap-1">
            {isOwner && (
              <button
                type="button"
                onClick={onDelete}
                aria-label="Delete post"
                className="rounded-full p-1.5 text-neutral-400 transition hover:bg-rose-50 hover:text-rose-500"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {post.imageUrls.length > 0 ? (
          <PhotoGallery images={post.imageUrls} alt={post.caption ?? "Post"} />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
            <ImageOff className="h-6 w-6" />
          </div>
        )}

        {post.eventTitle && (
          <div className="mt-3 text-xs text-neutral-500">
            {post.eventId && isOwner ? (
              <Link
                href={`/event/${post.eventId}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 font-medium text-neutral-700 transition hover:bg-neutral-200"
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {post.eventTitle}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-neutral-400" />
                From {post.eventTitle}
              </span>
            )}
          </div>
        )}

        {post.caption && (
          <p className="mt-3 text-[0.95rem] leading-relaxed text-neutral-800">{post.caption}</p>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
