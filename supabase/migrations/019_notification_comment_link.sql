-- ====================================================================
-- Credora migration 019: let notifications point at the exact comment
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- ====================================================================

-- Nullable: only comment-related notifications (comment, mention-in-a-
-- comment) set this. A like or a mention-in-a-post notification still just
-- points at post_id, same as before.
alter table public.notifications
  add column if not exists comment_id uuid references public.comments (id) on delete cascade;

-- Same function, now also recording which comment triggered it.
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  post_owner uuid;
begin
  select author_id into post_owner from public.posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
    values (post_owner, new.user_id, 'comment', new.post_id, new.id);
  end if;
  return new;
end;
$$;

-- Same function, now also recording which comment the mention was in.
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
      insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
      values (mentioned_id, new.user_id, 'mention', new.post_id, new.id);
      seen := array_append(seen, mentioned_id);
    end if;
  end loop;
  return new;
end;
$$;
