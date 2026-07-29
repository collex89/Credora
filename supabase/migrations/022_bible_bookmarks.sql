-- ====================================================================
-- Credora migration 022: persist Bible verse bookmarks
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- ====================================================================

-- Same shape as bible_highlights (migration 021) -- a distinct feature
-- (saved-for-later list vs. in-reading-view emphasis), so its own table
-- rather than a "type" column on bible_highlights, since a verse can be
-- highlighted, bookmarked, both, or neither independently.
create table public.bible_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id text not null,
  chapter integer not null,
  verse integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, book_id, chapter, verse)
);

create index bible_bookmarks_user_idx on public.bible_bookmarks (user_id);

alter table public.bible_bookmarks enable row level security;

create policy "Users can view their own bible bookmarks"
  on public.bible_bookmarks for select using (auth.uid() = user_id);

create policy "Users can create their own bible bookmarks"
  on public.bible_bookmarks for insert with check (auth.uid() = user_id);

create policy "Users can remove their own bible bookmarks"
  on public.bible_bookmarks for delete using (auth.uid() = user_id);
