-- ====================================================================
-- Credora migration 023: system-wide announcement notifications
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- ====================================================================
--
-- Existing notifications (like/comment/follow/mention) always have a real
-- actor -- the person who liked, commented, followed, or mentioned you.
-- An announcement from Crescamus itself (a feast day greeting, an app
-- update) has no such person, so actor_id needs to become optional, and
-- the type check needs a new option. A free-text `message` column holds
-- the actual copy, since unlike the other types there's no fixed template
-- to generate it from (see NOTIF_TEXT in src/lib/api.js).

alter table public.notifications
  add column if not exists message text;

alter table public.notifications
  alter column actor_id drop not null;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'mention', 'announcement'));

-- Every other type still requires a real actor; only announcements can
-- have a null one.
alter table public.notifications drop constraint if exists notifications_actor_required_unless_announcement;
alter table public.notifications add constraint notifications_actor_required_unless_announcement
  check (type = 'announcement' or actor_id is not null);

-- One-time send: today's Feast of the Assumption greeting, to everyone
-- with an account right now. Edit the message text below before running
-- if you want to change the wording.
insert into public.notifications (user_id, actor_id, type, message)
select id, null, 'announcement',
  'Happy Solemnity of the Assumption! Today the Church celebrates Mary''s assumption, body and soul, into heaven, a sign of the hope we all share. Wishing you a blessed feast day.'
from public.profiles;
