-- =============================================================================
-- Personal Daily Digest — seed two fake friends for testing
-- Paste into the Supabase SQL Editor and Run. Idempotent (safe to re-run).
--
-- Creates two auth users (they never log in — they exist so friend rows have
-- something to point at), gives them usernames, and makes each an ACCEPTED
-- friend of Joyce. Cleanup block is at the bottom (commented out).
--
-- Change the emails / usernames below if you like. Usernames must match
-- ^[a-z0-9_]{3,20}$ (lowercase letters, numbers, underscore; 3–20 chars).
-- =============================================================================

do $$
declare
  joyce_id uuid;
  u1 uuid;
  u2 uuid;
begin
  -- 1. Find the real account these fakes will befriend.
  select id into joyce_id
  from auth.users
  where lower(email) = 'joyce15huang@gmail.com';

  if joyce_id is null then
    raise exception 'Could not find joyce15huang@gmail.com in auth.users';
  end if;

  -- 2. Create (or reuse) the two fake auth users. No password/login needed;
  --    email_confirmed_at is set so they count as active.
  select id into u1 from auth.users where email = 'ada_lovelace@example.com';
  if u1 is null then
    u1 := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u1, 'authenticated', 'authenticated',
      'ada_lovelace@example.com', '',
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    );
  end if;

  select id into u2 from auth.users where email = 'grace_hopper@example.com';
  if u2 is null then
    u2 := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u2, 'authenticated', 'authenticated',
      'grace_hopper@example.com', '',
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    );
  end if;

  -- 3. Ensure profiles rows with usernames (covers whether or not the
  --    handle_new_user trigger fired on insert above).
  insert into public.profiles (id, email, username) values
    (u1, 'ada_lovelace@example.com', 'ada_lovelace'),
    (u2, 'grace_hopper@example.com',  'grace_hopper')
  on conflict (id) do update
    set username = excluded.username,
        email    = excluded.email;

  -- 4. Ensure preferences rows exist (the app expects one per user).
  insert into public.preferences (user_id, standing_prompt) values
    (u1, ''),
    (u2, '')
  on conflict (user_id) do nothing;

  -- 5. Make each an ACCEPTED friend of Joyce. Guarded so re-running doesn't
  --    hit the one-row-per-pair unique index.
  insert into public.friendships (requester_id, addressee_id, status, responded_at)
  select u1, joyce_id, 'accepted', now()
  where not exists (
    select 1 from public.friendships f
    where least(f.requester_id, f.addressee_id)    = least(u1, joyce_id)
      and greatest(f.requester_id, f.addressee_id) = greatest(u1, joyce_id)
  );

  insert into public.friendships (requester_id, addressee_id, status, responded_at)
  select u2, joyce_id, 'accepted', now()
  where not exists (
    select 1 from public.friendships f
    where least(f.requester_id, f.addressee_id)    = least(u2, joyce_id)
      and greatest(f.requester_id, f.addressee_id) = greatest(u2, joyce_id)
  );

  raise notice 'Seeded @ada_lovelace and @grace_hopper as friends of %', joyce_id;
end $$;

-- =============================================================================
-- CLEANUP — remove the fake users when you're done. Deleting the auth user
-- cascades to their profiles, preferences, friendships, and cards.
-- Uncomment and run:
-- =============================================================================
-- delete from auth.users
-- where email in ('ada_lovelace@example.com', 'grace_hopper@example.com');
