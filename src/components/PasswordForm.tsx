"use client";

import { useState } from "react";
import { Lock, Eye, EyeOff, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Set or change the login's password. Works for magic-link accounts too — once
 * set, you can sign in with email + password from the login page.
 */
export function PasswordForm({ email }: { email?: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Those passwords don't match.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      return setError(
        /reauthentication|recent/i.test(error.message)
          ? "For security, sign out and back in with an email link, then set it."
          : error.message,
      );
    }
    setPassword("");
    setConfirm("");
    setDone(true);
  }

  const field =
    "w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200";

  return (
    <form onSubmit={save} className="space-y-2.5 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <p className="text-sm text-neutral-600">
        Set a password to sign in{email ? ` as ${email}` : ""} without waiting for an email link.
      </p>
      {/* Hidden username field helps password managers save the right login. */}
      {email && <input type="email" autoComplete="username" value={email} readOnly hidden />}
      <label className="relative block">
        <span className="sr-only">New password</span>
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (8+ characters)"
          className={`${field} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </label>
      <label className="relative block">
        <span className="sr-only">Confirm password</span>
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          className={field}
        />
      </label>
      <div className="flex items-center gap-3 pt-0.5">
        <button
          type="submit"
          disabled={busy || !password}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save password
        </button>
        {done && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {error && <span className="text-sm text-rose-700">{error}</span>}
      </div>
    </form>
  );
}
