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

  // Read ?next and ?mode on the client (keeps the page static, no Suspense needed).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setNext(safeNext(p.get("next")));
    if (p.get("mode") === "signup") setMode("signup");
    if (p.get("error")) setError("That sign-in link didn't work. Try again.");
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
    if (error) return setError(friendly(error.message));
    window.location.assign(next);
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
          <div className="rounded-2xl bg-white p-6 text-center shadow-[0_8px_24px_rgba(80,50,35,0.08)]">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-600" strokeWidth={2} />
            <p className="text-[15px] font-semibold text-neutral-900">Check your inbox</p>
            <p className="mt-1 text-sm text-neutral-600">
              {sent === "magic" ? "We sent a sign-in link to " : "Confirm your email to finish — we sent a link to "}
              <span className="font-medium">{email}</span>.
            </p>
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
