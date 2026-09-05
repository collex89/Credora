-- ====================================================================
-- Credora migration 024: reading progress (continue where you left off)
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- ====================================================================
--
-- One row per user per piece of reading content -- a specific Bible book,
-- or a specific spiritual classic (see src/lib/books.js) -- rather than
-- one single "last read anything" row, so reopening a specific earlier
-- book still resumes at your own last chapter in *that* book, even after
-- reading further in something else since. The most recently updated row
-- across all of a user's content is what the "Continue Reading" banner
-- on Home shows.
create table public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content_type text not null check (content_type in ('bible', 'book')),
  -- Bible: a book id from BIBLE_BOOKS (e.g. "gen", "mat"). Book: an id
  -- from BOOKS_LIBRARY (e.g. "confessions"). Not a foreign key either
  -- way -- both live in static app data, not a database table, same as
  -- book_id in bible_highlights/bible_bookmarks.
  content_id text not null,
  chapter integer not null,
  -- Only meaningful when content_type = 'bible' -- which translation the
  -- reader was in, so resuming lands on the same text they were reading,
  -- not silently switched to whatever the app's current default is.
  bible_version text,
  updated_at timestamptz not null default now(),
  unique (user_id, content_type, content_id)
);

create index reading_progress_user_recent_idx
  on public.reading_progress (user_id, updated_at desc);

alter table public.reading_progress enable row level security;

create policy "Users can view their own reading progress"
  on public.reading_progress for select
  using (auth.uid() = user_id);

create policy "Users can upsert their own reading progress"
  on public.reading_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own reading progress"
  on public.reading_progress for update
  using (auth.uid() = user_id);
