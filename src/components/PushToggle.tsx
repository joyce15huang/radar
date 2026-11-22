"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { removePushSubscription, savePushSubscription } from "@/app/push-actions";

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

function keyBytes(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Turn notifications on or off for this device. On iPhone they work only from the home-screen app. */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !key) {
        return setState(ios && !standalone ? "install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [key]);

  async function turnOn() {
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource }));
      const res = await savePushSubscription(JSON.parse(JSON.stringify(sub)));
      if (!res.ok) {
        setError(res.error ?? "Couldn't turn them on.");
        return;
      }
      setState("on");
    } catch {
      setError("Couldn't turn them on in this browser.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;
  const line = "flex items-center justify-center gap-1.5 text-[12px] text-neutral-500";
  if (state === "unsupported") return <p className={line}><BellOff className="h-3.5 w-3.5" /> This browser can&rsquo;t show notifications.</p>;
  if (state === "install")
    return <p className={line}><BellOff className="h-3.5 w-3.5" /> For notifications on iPhone, add Blip Club to your Home Screen first.</p>;
  if (state === "denied")
    return <p className={line}><BellOff className="h-3.5 w-3.5" /> Notifications are blocked — allow them in your browser settings.</p>;

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={state === "on" ? turnOff : turnOn}
        disabled={busy}
        className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-200/60 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "on" ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
        {state === "on" ? "Notifications on · turn off" : "Turn on notifications"}
      </button>
      {error && <p className="text-[12px] font-medium text-rose-700">{error}</p>}
    </div>
  );
}
