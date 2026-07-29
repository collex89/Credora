-- ====================================================================
-- Credora migration 020: pin up to 2 posts to your profile
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- ====================================================================

-- Nullable: unpinned is the default state for every post. No RLS change
-- needed -- "Users can edit their own posts" (migration 013) already
-- covers updating this column on your own rows.
alter table public.posts add column if not exists pinned_at timestamptz;

create index if not exists posts_author_pinned_idx
  on public.posts (author_id, pinned_at) where pinned_at is not null;

-- The client already disables the "Pin to Profile" option once someone
-- has 2 pinned posts, but that's just UX -- this is the real limit, since
-- a second tab or a replayed request could otherwise slip past it. A
-- BEFORE UPDATE trigger can see the table's current on-disk state, which
-- still has this row's old (unpinned) value at the moment it runs, so the
-- count below naturally excludes the row being updated without needing to
-- filter it out explicitly.
create or replace function public.enforce_pin_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.pinned_at is not null and old.pinned_at is null then
    if (select count(*) from public.posts where author_id = new.author_id and pinned_at is not null) >= 2 then
      raise exception 'Cannot pin more than 2 posts';
    end if;
  end if;
  return new;
end;
$$;

create trigger on_post_pin_limit
  before update on public.posts
  for each row execute function public.enforce_pin_limit();
