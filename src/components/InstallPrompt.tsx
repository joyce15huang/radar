"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pdd-install-dismissed";

/**
 * A small "Add to home screen" card. Chrome/Edge/Android get a one-tap Install
 * button (beforeinstallprompt); iPhone Safari, which has no install API, gets
 * the Share → Add to Home Screen hint. Hidden once installed or dismissed.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (standalone || dismissed) return;

    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos) {
      setIos(true);
      setHidden(false);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || (!deferred && !ios)) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setHidden(true);
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white p-3 pl-4 shadow-[0_8px_24px_rgba(80,50,35,0.08)]">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-neutral-900">Put Digest on your home screen</p>
        {ios && !deferred && (
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[13px] text-neutral-600">
            Tap <Share className="inline h-3.5 w-3.5" aria-label="Share" /> then &ldquo;Add to Home Screen&rdquo;
          </p>
        )}
      </div>
      {deferred && (
        <button
          type="button"
          onClick={install}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700"
        >
          <Download className="h-4 w-4" /> Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
