-- ====================================================================
-- Credora migration 021: persist Bible verse highlights
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- ====================================================================

-- One row per highlighted verse. book_id matches BIBLE_BOOKS ids in the
-- client (e.g. "mat", "gen") rather than a foreign key -- the Bible text
-- itself lives in static JSON files, not a database table.
create table public.bible_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id text not null,
  chapter integer not null,
  verse integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, book_id, chapter, verse)
);

create index bible_highlights_user_idx on public.bible_highlights (user_id);

alter table public.bible_highlights enable row level security;

create policy "Users can view their own highlights"
  on public.bible_highlights for select using (auth.uid() = user_id);

create policy "Users can create their own highlights"
  on public.bible_highlights for insert with check (auth.uid() = user_id);

create policy "Users can remove their own highlights"
  on public.bible_highlights for delete using (auth.uid() = user_id);
