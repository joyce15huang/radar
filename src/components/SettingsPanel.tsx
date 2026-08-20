"use client";

import { PreferencesForm } from "./PreferencesForm";
import { ProfileForm, type ProfileInitial } from "./ProfileForm";
import { ProfileSwitcher } from "./ProfileSwitcher";
import type { PersonaSummary } from "@/app/persona-actions";

/** Settings: switch/create personas, your Locations (deck input), and the
 *  active persona's Public profile. No account type — audience is chosen
 *  per-event at creation time, not per-account. */
export function SettingsPanel({
  personas,
  profileInitial,
  prefsInitial,
}: {
  personas: PersonaSummary[];
  profileInitial: ProfileInitial;
  prefsInitial: { locations: string[] };
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          Profiles
        </h2>
        <ProfileSwitcher personas={personas} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          Locations
        </h2>
        <PreferencesForm initialLocations={prefsInitial.locations} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          Public profile
        </h2>
        <ProfileForm initial={profileInitial} />
      </section>
    </div>
  );
}
