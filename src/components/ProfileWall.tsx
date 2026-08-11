"use client";

import { useState } from "react";
import { Trash2, ImageOff } from "lucide-react";
import { CARD_TYPES } from "@/lib/cardTypes";
import { deletePost } from "@/app/post-actions";
import { EmptyState } from "./LibraryWall";

export interface ProfilePost {
  id: string;
  imageUrl: string | null;
  caption: string | null;
  createdAt: string;
  eventTitle?: string | null;
}

export function ProfileWall({
  posts,
  isOwner,
}: {
  posts: ProfilePost[];
  isOwner: boolean;
}) {
  const [items, setItems] = useState(posts);

  const remove = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    void deletePost(id);
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ImageOff className="h-7 w-7" strokeWidth={2} />}
        title={isOwner ? "No posts yet" : "Nothing posted yet"}
        body={
          isOwner
            ? "Tap the + button, choose Post, and share a photo. It’ll live here on your profile."
            : "This person hasn’t posted anything yet."
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((p) => (
        <PostCard key={p.id} post={p} isOwner={isOwner} onDelete={() => remove(p.id)} />
      ))}
    </div>
  );
}

function PostCard({
  post,
  isOwner,
  onDelete,
}: {
  post: ProfilePost;
  isOwner: boolean;
  onDelete: () => void;
}) {
  const meta = CARD_TYPES.social_post;
  const Icon = meta.icon;
  const date = formatDate(post.createdAt);

  return (
    <article className="relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <span className="absolute inset-y-0 left-0 w-1 bg-rose-400/80" aria-hidden />
      <div className="p-5 pl-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.chipClass}`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {meta.label}
          </span>
          <div className="flex items-center gap-2">
            {date && <span className="text-xs text-neutral-400 dark:text-neutral-500">{date}</span>}
            {isOwner && (
              <button
                type="button"
                onClick={onDelete}
                aria-label="Delete post"
                className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {post.eventTitle && (
          <p className="mb-2 text-xs text-neutral-400 dark:text-neutral-500">
            recap of <span className="font-medium">{post.eventTitle}</span>
          </p>
        )}

        {post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.imageUrl}
            alt={post.caption ?? "Post"}
            className="w-full rounded-xl border border-neutral-200/70 object-cover dark:border-neutral-800"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
            <ImageOff className="h-6 w-6" />
          </div>
        )}

        {post.caption && (
          <p className="mt-3 text-[0.95rem] leading-relaxed text-neutral-800 dark:text-neutral-100">
            {post.caption}
          </p>
        )}
      </div>
    </article>
  );
}

function formatDate(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
