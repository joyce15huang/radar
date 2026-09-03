-- =============================================================================
-- Test seed: a fake driver (@foo_bar) offering a carpool ride on the baseball
-- event, so you can see the "Claim seat" flow as a passenger.
-- Paste into the Supabase SQL Editor and Run. Idempotent (safe to re-run).
-- Requires migration 0022 (event_rides) applied first.
-- =============================================================================

do $$
declare
  drv uuid;
  ev  uuid;
begin
  -- 1. Fake driver auth user (never logs in) — the signup trigger provisions a
  --    profile + preferences row with owner_id = its own id.
  select id into drv from auth.users where email = 'foo_bar@example.com';
  if drv is null then
    drv := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', drv, 'authenticated', 'authenticated',
      'foo_bar@example.com', '',
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    );
  end if;

  -- Ensure the profile has the @foo_bar handle (in case the trigger didn't fire).
  insert into public.profiles (id, owner_id, email, username)
  values (drv, drv, 'foo_bar@example.com', 'foo_bar')
  on conflict (id) do update
    set username = excluded.username, email = excluded.email;

  insert into public.preferences (user_id, standing_prompt)
  values (drv, '') on conflict (user_id) do nothing;

  -- 2. Find the baseball event (most recent match on the title).
  select id into ev from public.events
  where title ilike '%baseball%'
  order by created_at desc
  limit 1;

  if ev is null then
    raise exception 'No event with "baseball" in the title — check events.title.';
  end if;

  -- 3. Add @foo_bar's ride (3 seats) if it isn't already there.
  if not exists (select 1 from public.event_rides where event_id = ev and driver_id = drv) then
    insert into public.event_rides (event_id, driver_id, seats, note)
    values (ev, drv, 3, 'Leaving from downtown ~6pm — 3 seats');
  end if;
end $$;

-- Cleanup later (optional): remove the seeded ride + driver.
-- delete from public.event_rides r using public.profiles p
--   where r.driver_id = p.id and p.username = 'foo_bar';
-- delete from auth.users where email = 'foo_bar@example.com';  -- cascades profile
