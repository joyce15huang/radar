"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, ImageOff, Images, X, CalendarClock, Heart, MessageCircle, Loader2, Camera } from "lucide-react";
import { deletePost } from "@/app/post-actions";
import { removeFromGrid, getPostSocial, toggleLike, addComment, type PostSocial } from "@/app/photo-actions";
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
  /** The underlying post (likes/comments live here). Defaults to `id`. */
  postId?: string;
  /** Set when this grid item is a pinned event photo rather than your own post. */
  pinId?: string;
  /** Who took a pinned photo, when it isn't the profile's owner ("tina"). */
  credit?: string;
}

/** Instagram-style profile grid: square thumbnails, tap to open the full post. */
export function ProfileWall({
  posts,
  isOwner,
  ownerName = "",
}: {
  posts: ProfilePost[];
  isOwner: boolean;
  /** Shown in the post card header. */
  ownerName?: string;
}) {
  const [items, setItems] = useState(posts);
  const [active, setActive] = useState<ProfilePost | null>(null);

  const remove = (post: ProfilePost) => {
    setItems((prev) => prev.filter((p) => p.id !== post.id));
    setActive((a) => (a?.id === post.id ? null : a));
    // A pinned event photo just comes off your grid; your own post is deleted.
    void (post.pinId ? removeFromGrid(post.pinId) : deletePost(post.id));
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
          ownerName={ownerName}
          onClose={() => setActive(null)}
          onDelete={() => remove(active)}
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

/** A post opened from the grid: a centered card with likes and comments. */
function PostDetail({
  post,
  isOwner,
  ownerName,
  onClose,
  onDelete,
}: {
  post: ProfilePost;
  isOwner: boolean;
  ownerName: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  const date = formatDate(post.takenOn || post.createdAt);
  const postId = post.postId ?? post.id;
  const [social, setSocial] = useState<PostSocial | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getPostSocial(postId).then((s) => live && setSocial(s));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [postId, onClose]);

  async function like() {
    if (!social) return;
    const prev = social;
    setSocial({ ...prev, liked: !prev.liked, likes: prev.likes + (prev.liked ? -1 : 1) });
    const r = await toggleLike(postId);
    if (!r.ok) {
      setSocial(prev);
      setError(r.error ?? null);
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    const r = await addComment(postId, draft);
    setSending(false);
    if (!r.ok || !r.comment) return setError(r.error ?? "Couldn't post that.");
    setSocial((s) => (s ? { ...s, comments: [...s.comments, r.comment!] } : s));
    setDraft("");
  }

  const comments = social?.comments ?? [];
  const visible = showAll ? comments : comments.slice(-2);
  const name = ownerName || "you";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(28,20,17,0.55)] p-3 backdrop-blur-[2px]" onClick={onClose}>
      <article
        role="dialog"
        aria-modal="true"
        aria-label="Post"
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_24px_60px_rgba(28,20,17,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[58px] shrink-0 items-center gap-2.5 pl-3.5 pr-1.5">
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-neutral-900 text-[13px] font-bold uppercase text-white">
            {name.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold text-neutral-900">{name}</span>
            {date && <span className="block text-[12px] text-neutral-500">{date}</span>}
          </span>
          {isOwner && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={post.pinId ? "Remove from grid" : "Delete post"}
              title={post.pinId ? "Remove from grid" : "Delete post"}
              className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {post.imageUrls.length > 0 ? (
            <PhotoGallery images={post.imageUrls} alt={post.caption ?? "Post"} />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-neutral-100 text-neutral-400">
              <ImageOff className="h-6 w-6" />
            </div>
          )}

          <div className="flex items-center gap-0.5 px-2 pt-2">
            <button
              type="button"
              onClick={like}
              disabled={!social?.available}
              aria-pressed={!!social?.liked}
              aria-label={social?.liked ? "Unlike" : "Like"}
              className="flex h-[42px] items-center gap-1.5 px-1.5 text-[14px] font-bold text-neutral-900 disabled:opacity-50"
            >
              <Heart className={`h-6 w-6 ${social?.liked ? "fill-fuchsia-700 text-fuchsia-700" : ""}`} strokeWidth={2} />
              {social ? social.likes : ""}
            </button>
            <label
              htmlFor={`comment-${post.id}`}
              className="flex h-[42px] cursor-pointer items-center gap-1.5 px-1.5 text-[14px] font-bold text-neutral-900"
            >
              <MessageCircle className="h-[23px] w-[23px]" strokeWidth={2} />
              {social ? comments.length : ""}
            </label>
          </div>

          <div className="space-y-1.5 px-4 pb-1.5">
            {post.caption && (
              <p className="text-[14px] leading-relaxed text-neutral-900">
                <span className="font-bold">{name}</span> {post.caption}
              </p>
            )}
            {post.credit && (
              <p className="flex items-center gap-1.5 text-[13px] text-neutral-500">
                <Camera className="h-3.5 w-3.5" /> Photo by {post.credit}
              </p>
            )}
            {post.eventTitle && (
              <p className="text-[13px] text-neutral-500">
                {post.eventId && isOwner ? (
                  <Link href={`/event/${post.eventId}`} className="inline-flex items-center gap-1.5 font-medium text-neutral-700 hover:underline">
                    <CalendarClock className="h-3.5 w-3.5" /> {post.eventTitle}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" /> From {post.eventTitle}
                  </span>
                )}
              </p>
            )}
            {comments.length > 2 && !showAll && (
              <button type="button" onClick={() => setShowAll(true)} className="text-[13px] font-semibold text-neutral-500">
                View all {comments.length} comments
              </button>
            )}
            {visible.map((c) => (
              <p key={c.id} className="text-[14px] leading-relaxed text-neutral-900">
                <span className="font-bold">{c.author}</span> {c.body}
              </p>
            ))}
            {error && <p className="text-[13px] text-rose-700">{error}</p>}
          </div>
        </div>

        <form onSubmit={send} className="mx-3 mb-3.5 mt-2 flex h-11 shrink-0 items-center gap-2 rounded-full bg-neutral-100 pl-4 pr-1.5">
          <input
            id={`comment-${post.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            aria-label="Add a comment"
            disabled={social ? !social.available : false}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400"
          />
          <button type="submit" disabled={!draft.trim() || sending} className="h-8 rounded-full px-3 text-[14px] font-bold text-fuchsia-800 disabled:opacity-40">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
          </button>
        </form>
      </article>
    </div>
  );
}

function formatDate(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
