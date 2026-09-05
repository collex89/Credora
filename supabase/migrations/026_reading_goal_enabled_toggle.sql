-- ====================================================================
-- Credora migration 026: make the daily reading goal opt-in
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- ====================================================================
--
-- 025_reading_goals.sql had no on/off state at all -- a row existing in
-- reading_goals was implicitly "goal tracking is active", which is why
-- every reader got automatic chapter-completion tracking and a
-- celebration toast with no way to turn it off. Defaults to false: a
-- goal now has to be explicitly turned on, and existing rows (from
-- anyone who saved a target before this existed) start disabled rather
-- than silently opting people in who never asked for tracking.
alter table public.reading_goals
  add column if not exists enabled boolean not null default false;
