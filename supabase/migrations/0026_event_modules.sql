-- 0026_event_modules.sql
-- Per-event optional sections. The host adds only the modules an event needs
-- (carpool / expenses / tasks); anything not listed here doesn't render.
-- Existing events default to '{}' — they start clean with no optional sections.
-- Cost (fee) and Comments are not gated here: Cost self-shows when there's a
-- fee, and Comments is always on.

alter table public.events
  add column if not exists modules text[] not null default '{}';
