-- 0034_post_taken_on.sql
-- A post can be dated to when the moment happened (default: today), separate
-- from when it was published. Powers the "pick a date → show that day's events
-- to link" flow and lets the profile grid sit a backdated post in its place.

alter table public.posts
  add column if not exists taken_on date;
