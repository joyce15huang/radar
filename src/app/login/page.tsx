"use client";

import { useState } from "react";
import { Sparkles, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            <Sparkles className="h-6 w-6" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Personal Daily Digest
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Your calm morning briefing. Sign in to begin.
          </p>
        </div>

        {status === "sent" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-500" strokeWidth={2} />
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
              Check your inbox
            </p>
            <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-400/80">
              We sent a magic link to <span className="font-medium">{email}</span>. Click it to
              sign in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                strokeWidth={2}
              />
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-neutral-200 bg-white py-3 pl-10 pr-3 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:ring-neutral-700"
              />
            </div>

            <button
              type="submit"
              disabled={status === "sending"}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {status === "sending" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending link…
                </>
              ) : (
                "Send magic link"
              )}
            </button>

            {status === "error" && (
              <p className="text-center text-sm text-rose-600 dark:text-rose-400">{errorMsg}</p>
            )}
          </form>
        )}

        <p className="mt-6 text-center text-xs text-neutral-400 dark:text-neutral-600">
          No password needed. We&rsquo;ll email you a secure sign-in link.
        </p>
      </div>
    </main>
  );
}
