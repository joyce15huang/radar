"use client";

import { useState } from "react";
import {
  Plus,
  X,
  Send,
  Loader2,
  PartyPopper,
  Check,
  Image as ImageIcon,
  CalendarClock,
  MapPin,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { sendCards, createPost, parseEventPreview } from "@/app/create-card-actions";
import { createClient } from "@/lib/supabase/client";
import { POST_IMAGES_BUCKET } from "@/lib/storage";
import type { ParsedEvent } from "@/lib/parse/schedule";

type Mode = "invite" | "post";
const MAX_PHOTOS = 8;

interface EventOption {
  id: string;
  title: string;
}

interface Result {
  mode: Mode;
  sent?: number;
  notFound?: string[];
  sharedWith?: number;
}

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

/**
 * A single-purpose create button. `mode="invite"` lives on the Calendar tab;
 * `mode="post"` lives on the Profile tab. (Pings were removed.)
 */
export function CreateCardFab({ mode, events = [] }: { mode: Mode; events?: EventOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Invite flow (parse → preview → send).
  const [recipients, setRecipients] = useState("");
  const [inviteText, setInviteText] = useState("");
  const [preview, setPreview] = useState<ParsedEvent | null>(null);

  // Post flow (multiple photos).
  const [postImages, setPostImages] = useState<{ file: File; url: string }[]>([]);

  function clearImages() {
    setPostImages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
  }
  function reset() {
    setError(null);
    setResult(null);
    setPreview(null);
    setInviteText("");
    setRecipients("");
    clearImages();
  }
  function close() {
    if (pending) return;
    setOpen(false);
  }

  function addFiles(picked: File[]) {
    if (picked.length === 0) return;
    const room = Math.max(0, MAX_PHOTOS - postImages.length);
    if (room === 0) return;
    // Build the previews synchronously from a real array snapshot (not the live
    // FileList, which the input clears after onChange).
    const mapped = picked
      .slice(0, room)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPostImages((prev) => [...prev, ...mapped]);
  }
  function removeImage(idx: number) {
    setPostImages((prev) => {
      const next = [...prev];
      const [gone] = next.splice(idx, 1);
      if (gone) URL.revokeObjectURL(gone.url);
      return next;
    });
  }

  async function handlePost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (postImages.length === 0) {
      setError("Choose at least one photo.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You're not signed in.");

      const paths: string[] = [];
      for (const { file } of postImages) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
        if (up.error) throw new Error(up.error.message);
        paths.push(path);
      }

      const res = await createPost({
        caption: String(fd.get("caption") ?? ""),
        imagePaths: paths,
        eventId: String(fd.get("eventId") ?? "") || null,
      });
      if (!res.ok) throw new Error(res.error ?? "Couldn't publish the post.");
      setResult({ mode: "post", sharedWith: res.sharedWith });
      clearImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function doPreview() {
    if (!inviteText.trim()) {
      setError("Describe the event.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await parseEventPreview(inviteText);
    setPending(false);
    if (!res.ok || !res.event) {
      setError(res.error ?? "Couldn't read that event.");
      return;
    }
    setPreview(res.event);
  }

  async function doSendInvite() {
    const list = recipients.split(/[\s,]+/).filter(Boolean);
    if (list.length === 0) {
      setError("Add at least one email.");
      return;
    }
    if (!preview) return;
    setPending(true);
    setError(null);
    const res = await sendCards({
      type: "social_invite",
      recipients: list,
      eventTitle: preview.title,
      eventTime: preview.when,
      startsAt: preview.startsAt,
      location: preview.location,
      note: preview.note,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't send.");
      return;
    }
    setResult({ mode: "invite", sent: res.sent, notFound: res.notFound });
  }

  const title = mode === "invite" ? "New event" : "New post";

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto flex max-w-xl justify-end px-4 pb-6 sm:px-6">
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(true);
            }}
            aria-label={title}
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg shadow-black/20 transition hover:scale-105 hover:bg-neutral-700 active:scale-95 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={close}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-neutral-900 sm:rounded-3xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            {result ? (
              <SentPanel result={result} onClose={() => setOpen(false)} onAgain={reset} />
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                    {mode === "invite" ? (
                      <PartyPopper className="h-5 w-5 text-neutral-400" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-neutral-400" />
                    )}
                    {title}
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {mode === "invite" ? (
                  <div className="space-y-3">
                    <Field label="Friends' emails">
                      <input
                        type="text"
                        value={recipients}
                        onChange={(e) => setRecipients(e.target.value)}
                        placeholder="ada@x.com, grace@y.com"
                        className={inputCls}
                      />
                      <span className="mt-1 block text-xs text-neutral-400">
                        Separate multiple emails with commas or spaces.
                      </span>
                    </Field>

                    {!preview ? (
                      <>
                        <Field label="What's the plan?">
                          <textarea
                            rows={3}
                            value={inviteText}
                            onChange={(e) => setInviteText(e.target.value)}
                            placeholder="rooftop dinner this Saturday 7pm at my place, bring snacks"
                            className={`${inputCls} resize-y`}
                          />
                        </Field>
                        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                        <button
                          type="button"
                          onClick={doPreview}
                          disabled={pending}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                        >
                          {pending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Reading it…
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" /> Preview event
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
                          <h3 className="text-[1.05rem] font-semibold text-neutral-900 dark:text-neutral-50">
                            {preview.title}
                          </h3>
                          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                            <CalendarClock className="h-4 w-4 text-neutral-400" />
                            {preview.when}
                          </p>
                          {preview.location && (
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
                              <MapPin className="h-4 w-4 text-neutral-400" />
                              {preview.location}
                            </p>
                          )}
                          {preview.note && (
                            <p className="mt-1 text-sm italic text-neutral-500 dark:text-neutral-400">
                              {preview.note}
                            </p>
                          )}
                        </div>
                        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPreview(null);
                              setError(null);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                          >
                            <ArrowLeft className="h-4 w-4" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={doSendInvite}
                            disabled={pending}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                          >
                            {pending ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4" /> Send invite
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-center text-xs text-neutral-400 dark:text-neutral-600">
                          No notification, no read receipt — they find it in tomorrow&rsquo;s deck.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handlePost} className="space-y-3">
                    {/* Not wrapped in <label>: a label would forward clicks on the
                        thumbnails' remove buttons to the file input. */}
                    <div>
                      <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        Photos
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const picked = Array.from(e.target.files ?? []);
                          e.currentTarget.value = "";
                          addFiles(picked);
                        }}
                        className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-700 dark:text-neutral-300 dark:file:bg-white dark:file:text-neutral-900"
                      />
                      <span className="mt-1 block text-xs text-neutral-400">
                        Add up to {MAX_PHOTOS}. They become one swipeable card.
                      </span>
                      {postImages.length > 0 && (
                        <div className="mt-2 grid grid-cols-4 gap-2">
                          {postImages.map((img, i) => (
                            <div
                              key={img.url}
                              className="relative aspect-square overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img.url} alt="" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeImage(i)}
                                aria-label="Remove photo"
                                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white transition hover:bg-black/80"
                              >
                                <X className="h-3 w-3" strokeWidth={2.5} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Field label="Caption (optional)">
                      <textarea
                        name="caption"
                        rows={2}
                        placeholder="what's the moment?"
                        className={`${inputCls} resize-y`}
                      />
                    </Field>
                    <Field label="Link to an event (optional)">
                      <select name="eventId" className={inputCls} defaultValue="">
                        <option value="">Just my profile</option>
                        {events.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            Share with attendees of “{ev.title}”
                          </option>
                        ))}
                      </select>
                      {events.length === 0 && (
                        <span className="mt-1 block text-xs text-neutral-400">
                          Create an event invite first to share posts with its attendees.
                        </span>
                      )}
                    </Field>

                    {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

                    <button
                      type="submit"
                      disabled={pending}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                    >
                      {pending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Publishing…
                        </>
                      ) : (
                        <>
                          <ImageIcon className="h-4 w-4" /> Publish post
                        </>
                      )}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

function SentPanel({
  result,
  onClose,
  onAgain,
}: {
  result: Result;
  onClose: () => void;
  onAgain: () => void;
}) {
  let title = "Done";
  let body = "";
  if (result.mode === "post") {
    title = "Posted";
    body =
      result.sharedWith && result.sharedWith > 0
        ? `It's on your profile and shared with ${result.sharedWith} attendee${result.sharedWith === 1 ? "" : "s"}.`
        : "It's up on your profile.";
  } else {
    title = "Invite sent";
    const n = result.sent ?? 0;
    body = `Delivered to ${n} deck${n === 1 ? "" : "s"}.`;
    if (result.notFound && result.notFound.length > 0) {
      body += ` Not on the app yet: ${result.notFound.join(", ")}.`;
    }
  }

  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400">
        <Check className="h-7 w-7" strokeWidth={2.5} />
      </div>
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">{body}</p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onAgain}
          className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Create another
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Done
        </button>
      </div>
    </div>
  );
}
