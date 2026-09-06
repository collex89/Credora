-- ====================================================================
-- Crescamus migration 028: real push for likes and comments
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
--
-- Deploy the new Edge Function first (or after -- order doesn't matter,
-- net.http_post below is fire-and-forget so a missing function just means
-- a few early pushes silently don't go out, the in-app notification still
-- gets created either way):
--   supabase functions deploy send-interaction-push --no-verify-jwt
--
-- No new secret needed -- this reuses the same 'cron_secret' Vault entry
-- already created for migration 016/017.
-- ====================================================================

-- Same trigger, now also firing a real OS push at the post's owner the
-- instant the like lands, so they see it even with the app closed --
-- mirrors the in-app notification this already created, just also on the
-- lock screen. The post_owner <> new.user_id self-check above already
-- guarantees you never get pushed for liking your own post.
create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  post_owner uuid;
  actor_name text;
begin
  select author_id into post_owner from public.posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, post_id)
    values (post_owner, new.user_id, 'like', new.post_id);

    select coalesce(full_name, username, 'Someone') into actor_name
    from public.profiles where id = new.user_id;

    perform net.http_post(
      url := 'https://dvhiurxvasyytoogixhr.supabase.co/functions/v1/send-interaction-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := jsonb_build_object(
        'recipient_id', post_owner,
        'title', actor_name || ' liked your post',
        'body', 'Tap to see it on Crescamus.'
      )
    );
  end if;
  return new;
end;
$$;

-- Same as migration 019's version (comment_id still recorded), now also
-- pushing the first ~100 characters of the comment so the notification
-- reads like the actual comment, not just "someone commented".
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  post_owner uuid;
  actor_name text;
  preview text;
begin
  select author_id into post_owner from public.posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
    values (post_owner, new.user_id, 'comment', new.post_id, new.id);

    select coalesce(full_name, username, 'Someone') into actor_name
    from public.profiles where id = new.user_id;

    preview := left(new.text, 100) || case when length(new.text) > 100 then '...' else '' end;

    perform net.http_post(
      url := 'https://dvhiurxvasyytoogixhr.supabase.co/functions/v1/send-interaction-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := jsonb_build_object(
        'recipient_id', post_owner,
        'title', actor_name || ' commented on your post',
        'body', preview
      )
    );
  end if;
  return new;
end;
$$;
