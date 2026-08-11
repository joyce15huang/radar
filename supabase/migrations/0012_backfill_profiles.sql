-- =============================================================================
-- Personal Daily Digest — backfill missing profiles rows
-- Run in Supabase SQL Editor after 0011. Idempotent, safe to re-run.
--
-- The `handle_new_user` trigger (0001) provisions a profiles row on signup, but
-- accounts created BEFORE that trigger existed (or a signup where it didn't fire)
-- have no row. Without one they can't set a username and can't be found by
-- friends. This creates the missing rows (username stays null → they'll pick one
-- at /onboarding on next load).
-- =============================================================================

insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- Same for the preferences row the app expects (0001 provisions this too).
insert into public.preferences (user_id, standing_prompt)
select u.id, ''
from auth.users u
left join public.preferences pr on pr.user_id = u.id
where pr.user_id is null
on conflict (user_id) do nothing;
