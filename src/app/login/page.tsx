"use client";

import { useEffect, useState } from "react";
import { Mail, Lock, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safeNext";

type Mode = "signin" | "signup" | "magic";

/**
 * Sign in / sign up with email + password, or get a one-time magic link.
 * Honors ?next= (e.g. an invite link) and ?mode=signup.
 */
export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [next, setNext] = useState("/calendar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<null | "magic" | "confirm">(null);
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);

  // Read ?next and ?mode on the client (keeps the page static, no Suspense needed).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setNext(safeNext(p.get("next")));
    if (p.get("mode") === "signup") setMode("signup");
    // Supabase reports link failures in the URL hash (#error_code=otp_expired…).
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errCode = h.get("error_code") ?? p.get("error_code");
    if (errCode === "otp_expired") {
      setError("That email link expired or was already used. Send yourself a fresh one below.");
      setMode("magic");
    } else if (p.get("error") || h.get("error")) {
      setError("That sign-in link didn't work. Send yourself a fresh one below.");
      setMode("magic");
    }
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    setError("");
    const supabase = createClient();

    if (mode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback() } });
      setBusy(false);
      if (error) return setError(error.message);
      return setSent("magic");
    }

    if (password.length < 8) {
      setBusy(false);
      return setError("Use at least 8 characters for your password.");
    }

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callback() },
      });
      setBusy(false);
      if (error) return setError(friendly(error.message));
      // With email confirmation on, there's no session until they click the email.
      if (!data.session) return setSent("confirm");
      window.location.assign(next);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      // Signed up but never confirmed: send a fresh confirmation and show the code box.
      if (/email not confirmed/i.test(error.message)) {
        await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: callback() } });
        return setSent("confirm");
      }
      return setError(friendly(error.message));
    }
    window.location.assign(next);
  }

  /** The 6-digit code from the email — works on any device, no link needed. */
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6) return setError("Enter the 6-digit code from the email.");
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: sent === "confirm" ? "signup" : "email" });
    setBusy(false);
    if (error) {
      return setError(/expired|invalid/i.test(error.message) ? "That code expired or doesn't match. Send a new one." : error.message);
    }
    window.location.assign(next);
  }

  async function resend() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } =
      sent === "confirm"
        ? await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: callback() } })
        : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback() } });
    setBusy(false);
    if (error) return setError(error.message);
    setResent(true);
    setCode("");
  }

  const field =
    "w-full rounded-2xl border border-neutral-200 bg-white py-3.5 pl-11 pr-3 text-[15px] text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-linen px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-neutral-900">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-[15px] text-neutral-600">
            {next.startsWith("/i/") ? "Then you'll land right on the invite." : "Plans with friends, in one calm place."}
          </p>
        </div>

        {sent ? (
          <div className="rounded-2xl bg-white p-6 shadow-[0_8px_24px_rgba(80,50,35,0.08)]">
            <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-600" strokeWidth={2} />
            <p className="text-[15px] font-semibold text-neutral-900">Check your inbox</p>
            <p className="mt-1 text-sm text-neutral-600">
              {sent === "magic" ? "We sent a sign-in email to " : "Confirm your email to finish — we sent it to "}
              <span className="font-medium">{email}</span>. Tap the link, or enter the code from it here.
            </p>
            <form onSubmit={verifyCode} className="mt-4 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                placeholder="6-digit code"
                aria-label="Code from the email"
                className="h-12 min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-white px-4 text-[17px] font-semibold tracking-[0.2em] text-neutral-900 outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              />
              <button
                type="submit"
                disabled={busy}
                className="h-12 shrink-0 rounded-2xl bg-fuchsia-700 px-5 text-[15px] font-semibold text-white transition hover:bg-fuchsia-800 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
              </button>
            </form>
            {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
            <button
              type="button"
              onClick={resend}
              disabled={busy}
              className="mt-4 text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline"
            >
              {resent ? "Sent again — check your inbox" : "Didn't get it? Send again"}
            </button>
          </div>
        ) : (
          <>
            {mode !== "magic" && (
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-neutral-200/70 p-1">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setError("");
                    }}
                    aria-pressed={mode === m}
                    className={`h-10 rounded-full text-sm font-semibold transition ${
                      mode === m ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"
                    }`}
                  >
                    {m === "signin" ? "Sign in" : "Sign up"}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={submit} className="space-y-3">
              <label className="relative block">
                <span className="sr-only">Email</span>
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={field}
                />
              </label>

              {mode !== "magic" && (
                <label className="relative block">
                  <span className="sr-only">Password</span>
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type={show ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Create a password (8+ characters)" : "Password"}
                    className={`${field} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </label>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-700 text-[15px] font-semibold text-white transition hover:bg-fuchsia-800 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "signup" ? "Create account" : mode === "magic" ? "Email me a link" : "Sign in"}
              </button>

              {error && <p className="text-center text-sm text-rose-700">{error}</p>}
            </form>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "magic" ? "signin" : "magic");
                setError("");
              }}
              className="mx-auto mt-5 block text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline"
            >
              {mode === "magic" ? "Use a password instead" : "Forgot it? Email me a sign-in link"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function friendly(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match.";
  if (/already registered/i.test(msg)) return "You already have an account — sign in instead.";
  return msg;
}
