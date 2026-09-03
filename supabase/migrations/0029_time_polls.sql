-- =============================================================================
-- Personal Daily Digest — Time polls ("Find a time")
-- Run in Supabase SQL Editor after 0028. Idempotent.
--
-- A host proposes a few candidate times for a draft event and sends it to
-- friends; each recipient answers Free / If-need-be / No per option. ONLY THE
-- HOST sees the responses. When enough are in, the host finalizes into a real
-- event (existing social_invite flow) — `time_polls.event_id` links the two.
-- =============================================================================

-- Allow the time_poll card type (delivered to each recipient's deck).
alter table public.cards drop constraint if exists cards_type_check;
alter table public.cards add constraint cards_type_check check (
  type in (
    'news_scout', 'time_window', 'social_ping', 'social_invite',
    'calendar_radar', 'social_post', 'event_update', 'time_poll'
  )
);

create table if not exists public.time_polls (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  note       text,
  location   text,
  status     text not null default 'open',   -- open | closed
  event_id   uuid references public.events (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists time_polls_host_idx on public.time_polls (host_id);

create table if not exists public.poll_options (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.time_polls (id) on delete cascade,
  label      text not null,
  starts_at  timestamptz,
  ends_at    timestamptz,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists poll_options_poll_idx on public.poll_options (poll_id);

create table if not exists public.poll_recipients (
  poll_id    uuid not null references public.time_polls (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, profile_id)
);

create table if not exists public.poll_responses (
  poll_id    uuid not null references public.time_polls (id) on delete cascade,
  option_id  uuid not null references public.poll_options (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  avail      smallint not null default 0,      -- 0 no · 1 if need be · 2 free
  updated_at timestamptz not null default now(),
  primary key (option_id, profile_id)
);
create index if not exists poll_responses_poll_idx on public.poll_responses (poll_id);

-- RLS. Mutations run through the service-role admin client; these policies are
-- defense-in-depth and encode the privacy rule (only the host reads responses).
alter table public.time_polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_recipients enable row level security;
alter table public.poll_responses enable row level security;

-- time_polls: host manages; a recipient may read the poll they were sent.
drop policy if exists "polls - host manages" on public.time_polls;
create policy "polls - host manages" on public.time_polls
  for all using (public.owns_profile(host_id)) with check (public.owns_profile(host_id));
drop policy if exists "polls - recipient reads" on public.time_polls;
create policy "polls - recipient reads" on public.time_polls
  for select using (
    exists (
      select 1 from public.poll_recipients r
      where r.poll_id = time_polls.id and public.owns_profile(r.profile_id)
    )
  );

-- poll_options: host manages; host or a recipient may read.
drop policy if exists "poll_options - host manages" on public.poll_options;
create policy "poll_options - host manages" on public.poll_options
  for all using (
    exists (select 1 from public.time_polls p where p.id = poll_options.poll_id and public.owns_profile(p.host_id))
  ) with check (
    exists (select 1 from public.time_polls p where p.id = poll_options.poll_id and public.owns_profile(p.host_id))
  );
drop policy if exists "poll_options - guest reads" on public.poll_options;
create policy "poll_options - guest reads" on public.poll_options
  for select using (
    exists (select 1 from public.time_polls p where p.id = poll_options.poll_id and public.owns_profile(p.host_id))
    or exists (select 1 from public.poll_recipients r where r.poll_id = poll_options.poll_id and public.owns_profile(r.profile_id))
  );

-- poll_recipients: host manages; a recipient may read their own row.
drop policy if exists "poll_recipients - host manages" on public.poll_recipients;
create policy "poll_recipients - host manages" on public.poll_recipients
  for all using (
    exists (select 1 from public.time_polls p where p.id = poll_recipients.poll_id and public.owns_profile(p.host_id))
  ) with check (
    exists (select 1 from public.time_polls p where p.id = poll_recipients.poll_id and public.owns_profile(p.host_id))
  );
drop policy if exists "poll_recipients - self reads" on public.poll_recipients;
create policy "poll_recipients - self reads" on public.poll_recipients
  for select using (public.owns_profile(profile_id));

-- poll_responses: a respondent manages ONLY their own rows; the host may READ
-- every response to their poll (nobody else can). This is the privacy rule.
drop policy if exists "poll_responses - self manages" on public.poll_responses;
create policy "poll_responses - self manages" on public.poll_responses
  for all using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));
drop policy if exists "poll_responses - host reads" on public.poll_responses;
create policy "poll_responses - host reads" on public.poll_responses
  for select using (
    exists (select 1 from public.time_polls p where p.id = poll_responses.poll_id and public.owns_profile(p.host_id))
  );
