"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Loader2, Check, Link2 } from "lucide-react";
import { inviteToEvent } from "@/app/event-actions";
import { getInviteLink, getInviteLinkForCard } from "@/app/invite-link-actions";
import { listFriendOptions } from "@/app/friends-actions";
import { FriendPicker } from "@/components/FriendPicker";
import type { FriendOption } from "@/lib/friends";

type Target =
  | { kind: "source"; cardId: string }
  | { kind: "event"; eventId: string };

/**
 * Invite sheet: search friends, send. Plus a short link for anyone not on the
 * app yet. (Whether guests may invite others is set in the event's Edit.)
 */
export function InviteComposer({
  eventTitle,
  target,
  onClose,
}: {
  eventTitle: string;
  target: Target;
  onClose: () => void;
}) {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [selected, setSelected] = useState<FriendOption[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [eventId, setEventId] = useState<string | null>(target.kind === "event" ? target.eventId : null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [link, setLink] = useState<"idle" | "loading" | "copied">("idle");

  // Existing events: show their invite link straight away.
  const existingEventId = target.kind === "event" ? target.eventId : null;
  useEffect(() => {
    if (!existingEventId) return;
    let active = true;
    getInviteLink(existingEventId)
      .then((r) => active && r.ok && r.url && setLinkUrl(r.url))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [existingEventId]);

  useEffect(() => {
    let active = true;
    listFriendOptions()
      .then((list) => active && setFriends(list))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Refresh only once the sheet closes: sending from a personal item remounts
  // the calendar list, which would otherwise unmount this sheet mid-send.
  const close = () => {
    if (sent !== null || dirty) router.refresh();
    onClose();
  };

  async function send() {
    const list = selected.map((f) => f.username).filter(Boolean);
    if (list.length === 0) return setError("Pick someone to send it to.");
    setPending(true);
    setError(null);
    const res = await inviteToEvent({
      ...(target.kind === "source" ? { sourceCardId: target.cardId } : { eventId: target.kind === "event" ? target.eventId : undefined }),
      recipients: list,
    });
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Couldn't send the invite.");
    if (res.eventId) setEventId(res.eventId);
    setSent(res.sent ?? 0);
  }

  /** Personal items have no event yet — making a link turns them into one you host. */
  async function createLink() {
    setLink("loading");
    setError(null);
    let url: string | undefined;
    let err: string | undefined;
    if (eventId) {
      const r = await getInviteLink(eventId);
      url = r.url;
      err = r.error;
    } else if (target.kind === "source") {
      const r = await getInviteLinkForCard(target.cardId);
      url = r.url;
      err = r.error;
      if (r.eventId) {
        setEventId(r.eventId);
        setDirty(true); // it's a shared event now — refresh the calendar on close
      }
    }
    setLink("idle");
    if (!url) return setError(err ?? "Couldn't make a link.");
    setLinkUrl(url);
  }

  async function copyLink() {
    if (!linkUrl) return;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: eventTitle, url: linkUrl });
      } else {
        await navigator.clipboard.writeText(linkUrl);
      }
      setLink("copied");
      window.setTimeout(() => setLink("idle"), 2000);
    } catch {
      /* share sheet dismissed */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={close}>
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-[17px] font-bold text-neutral-900">Invite to {eventTitle}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {sent !== null ? (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3">
            <Check className="h-5 w-5 shrink-0 text-emerald-700" strokeWidth={2.6} />
            <p className="text-[15px] font-semibold text-emerald-900">
              {sent === 0 ? "They're already invited" : sent === 1 ? "Sent — it's on their calendar" : `Sent to ${sent} friends`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <FriendPicker friends={friends} selected={selected} onChange={setSelected} />
            <button
              type="button"
              onClick={send}
              disabled={pending || selected.length === 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-700 text-[15px] font-semibold text-white transition hover:bg-fuchsia-800 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {selected.length > 1 ? `Send to ${selected.length}` : "Send"}
            </button>
          </div>
        )}

        <div className="mt-5 border-t border-neutral-100 pt-4">
          <p className="mb-2 text-[13px] font-semibold text-neutral-500">Invite link</p>
          {linkUrl ? (
            <div className="flex items-center gap-2 rounded-2xl bg-neutral-100 p-1.5 pl-3.5">
              <Link2 className="h-4 w-4 shrink-0 text-neutral-500" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-neutral-800">
                {linkUrl.replace(/^https?:\/\//, "")}
              </span>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700"
              >
                {link === "copied" ? <Check className="h-4 w-4" /> : null}
                {link === "copied" ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={createLink}
              disabled={link === "loading"}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 text-[15px] font-semibold text-neutral-800 transition hover:bg-neutral-50"
            >
              {link === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Create invite link
            </button>
          )}
        </div>

        {error && <p className="mt-3 text-center text-sm text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
