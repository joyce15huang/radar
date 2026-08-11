-- =============================================================================
-- Personal Daily Digest — multi-photo posts / recaps
-- Run in Supabase SQL Editor after 0008. Idempotent.
-- A post (and the social_post recap card it fans out) can now carry several
-- photos. image_path stays as the primary/first image for back-compat; the full
-- ordered list lives in image_paths.
-- =============================================================================

alter table public.posts
  add column if not exists image_paths text[] not null default '{}';
