-- 0030_poll_cost.sql
-- Group-event polls carry the draft event's cost + pay handles, so when the host
-- finalizes a time the fee and Venmo/Zelle flow onto the real event (and its
-- invite cards) — same fields events already have from 0020/0021.

alter table public.time_polls
  add column if not exists fee_cents  integer,
  add column if not exists venmo_id   text,
  add column if not exists zelle_id   text;
