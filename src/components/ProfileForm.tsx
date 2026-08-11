"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { saveProfile } from "@/app/profile-identity-actions";

export interface ProfileInitial {
  displayName: string;
  bio: string;
  website: string;
  instagram: string;
  twitter: string;
}

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:ring-neutral-700";

/** The org/group public-profile fields (shown only for org/group account kinds). */
export function ProfileForm({
  initial,
  kind,
}: {
  initial: ProfileInitial;
  kind: "org" | "group";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await saveProfile({
        displayName: String(fd.get("displayName") ?? ""),
        kind,
        bio: String(fd.get("bio") ?? ""),
        website: String(fd.get("website") ?? ""),
        instagram: String(fd.get("instagram") ?? ""),
        twitter: String(fd.get("twitter") ?? ""),
      });
      if (!res.ok) throw new Error(res.error ?? "Couldn't save.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Display name">
        <input name="displayName" defaultValue={initial.displayName} placeholder="SF Social Club" className={inputCls} />
      </Field>

      <Field label="Bio">
        <textarea name="bio" rows={2} defaultValue={initial.bio} placeholder="Weekly social events for SF newcomers. All welcome." className={`${inputCls} resize-y`} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Website"><input name="website" defaultValue={initial.website} placeholder="sfsocial.club" className={inputCls} /></Field>
        <Field label="Instagram"><input name="instagram" defaultValue={initial.instagram} placeholder="@handle" className={inputCls} /></Field>
        <Field label="Twitter / X"><input name="twitter" defaultValue={initial.twitter} placeholder="@handle" className={inputCls} /></Field>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            "Save profile"
          )}
        </button>
        {saved && !pending && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" strokeWidth={2.5} /> Saved
          </span>
        )}
        {error && <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>}
      </div>
    </form>
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
