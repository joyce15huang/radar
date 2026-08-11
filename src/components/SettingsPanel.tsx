"use client";

import { useState } from "react";
import { User, Building2, Users } from "lucide-react";
import { PreferencesForm } from "./PreferencesForm";
import { ProfileForm, type ProfileInitial } from "./ProfileForm";
import { setAccountKind } from "@/app/profile-identity-actions";

type Kind = "person" | "org" | "group";

const KINDS: { value: Kind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "person", label: "Just me", icon: User },
  { value: "org", label: "Organization", icon: Building2 },
  { value: "group", label: "Group / Team", icon: Users },
];

export function SettingsPanel({
  initialKind,
  profileInitial,
  prefsInitial,
}: {
  initialKind: Kind;
  profileInitial: ProfileInitial;
  prefsInitial: { standingPrompt: string; weeklyPrompt: string };
}) {
  const [kind, setKind] = useState<Kind>(initialKind);

  function choose(k: Kind) {
    if (k === kind) return;
    setKind(k);
    void setAccountKind(k);
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          Account type
        </h2>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
          {KINDS.map((k) => {
            const Icon = k.icon;
            return (
              <button
                key={k.value}
                type="button"
                onClick={() => choose(k.value)}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
                  kind === k.value
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-950 dark:text-white"
                    : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400"
                }`}
              >
                <Icon className="h-4 w-4" />
                {k.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
          Switching type here is for testing — this moves to onboarding later (one account = one type).
        </p>
      </section>

      {kind === "person" ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            Interests
          </h2>
          <PreferencesForm
            initialPrompt={prefsInitial.standingPrompt}
            initialWeeklyPrompt={prefsInitial.weeklyPrompt}
          />
        </section>
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            Public profile
          </h2>
          <ProfileForm initial={profileInitial} kind={kind} />
        </section>
      )}
    </div>
  );
}
