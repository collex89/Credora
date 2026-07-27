-- ====================================================================
-- Credora migration 018: @username tagging in posts and comments
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- ====================================================================

-- Allow the new notification type.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'mention'));

-- Same trust boundary as the like/comment/follow triggers in 002: mention
-- notifications are only ever created here, server-side, by scanning the
-- text that was actually saved -- a client can't fabricate one for a
-- username it didn't really write into the post/comment body.

create or replace function public.notify_on_mention_post()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m text[];
  mentioned_id uuid;
  seen uuid[] := '{}';
begin
  -- The leading group requires @ to not be glued to a preceding letter/digit
  -- (m[1] is discarded) -- otherwise "a@b.com" would misread as a mention of
  -- "b.com".
  for m in select regexp_matches(new.text, '(^|[^a-zA-Z0-9])@([a-z0-9._]{3,20})', 'g') loop
    select id into mentioned_id from public.profiles where username = lower(m[2]);
    if mentioned_id is not null and mentioned_id <> new.author_id and not (mentioned_id = any(seen)) then
      insert into public.notifications (user_id, actor_id, type, post_id)
      values (mentioned_id, new.author_id, 'mention', new.id);
      seen := array_append(seen, mentioned_id);
    end if;
  end loop;
  return new;
end;
$$;

create trigger on_post_mention_notify
  after insert on public.posts
  for each row execute function public.notify_on_mention_post();

create or replace function public.notify_on_mention_comment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m text[];
  mentioned_id uuid;
  seen uuid[] := '{}';
begin
  for m in select regexp_matches(new.text, '(^|[^a-zA-Z0-9])@([a-z0-9._]{3,20})', 'g') loop
    select id into mentioned_id from public.profiles where username = lower(m[2]);
    if mentioned_id is not null and mentioned_id <> new.user_id and not (mentioned_id = any(seen)) then
      insert into public.notifications (user_id, actor_id, type, post_id)
      values (mentioned_id, new.user_id, 'mention', new.post_id);
      seen := array_append(seen, mentioned_id);
    end if;
  end loop;
  return new;
end;
$$;

create trigger on_comment_mention_notify
  after insert on public.comments
  for each row execute function public.notify_on_mention_comment();
