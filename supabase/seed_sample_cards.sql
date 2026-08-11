-- =============================================================================
-- Optional TEST seed — insert one of each social/calendar card type for yourself,
-- so you can see the full polymorphic feed before the Create-Card FAB (Phase 3).
--
-- 1. Replace the email below with your login email.
-- 2. Run in Supabase SQL Editor.
-- 3. Reload the app — three new cards appear alongside any scout cards.
--
-- Safe to re-run (it clears its own previously-seeded sample rows first).
-- =============================================================================

with me as (
  select id from auth.users where email = 'joyce15huang@gmail.com'
)
-- clear prior samples so re-running doesn't duplicate
, cleared as (
  delete from public.cards
  where user_id = (select id from me)
    and content ->> 'sample' = 'true'
  returning 1
)
insert into public.cards (user_id, sender_id, type, title, content, status)
select id, null::uuid, 'social_ping', null,
  jsonb_build_object(
    'sample', 'true',
    'senderName', 'Marcus Lee',
    'message', 'saw this and thought of your NVDA thesis — no rush, weekend read 👀',
    'link', 'https://www.reuters.com/technology'
  ), 'pending'
from me
union all
select id, null::uuid, 'social_invite', 'Rooftop dinner + board games',
  jsonb_build_object(
    'sample', 'true',
    'senderName', 'Dana Kim',
    'eventTime', 'Sat, Aug 9 · 7:00 PM',
    'location', 'Hayes Valley',
    'note', 'Low-key, bringing the good snacks. You in?'
  ), 'pending'
from me
union all
select id, null::uuid, 'calendar_radar', 'Design review with Priya',
  jsonb_build_object(
    'sample', 'true',
    'time', 'Today · 2:30 PM',
    'location', 'Google Meet',
    'details', 'She shared the onboarding Figma this morning.'
  ), 'pending'
from me
union all
select id, null::uuid, 'time_window', 'Perseid meteor shower peaks this week',
  jsonb_build_object(
    'sample', 'true',
    'category', 'local',
    'summary', 'The Perseids peak in the next couple of nights — best viewing after midnight away from city lights. No equipment needed.',
    'actionLabel', 'Viewing guide',
    'actionUrl', 'https://www.timeanddate.com/astronomy/meteor-shower/perseids.html',
    'expiresAt', to_char((now() + interval '2 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'opensAt', null,
    'windowLabel', null
  ), 'pending'
from me;
