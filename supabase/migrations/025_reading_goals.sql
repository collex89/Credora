-- ====================================================================
-- Credora migration 025: reading goals and chapter completion logs
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- ====================================================================
--
-- Enables users to configure daily reading goals (chapters per day,
-- focus scope), and records actual completed chapters so Crescamus can
-- automatically monitor, compute streaks, and track real progress.

create table if not exists public.reading_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade unique,
  daily_target_chapters integer not null default 2 check (daily_target_chapters between 1 and 50),
  focus_scope text not null default 'all' check (focus_scope in ('all', 'bible', 'book')),
  target_book_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reading_goals enable row level security;

create policy "Users can view their own reading goal"
  on public.reading_goals for select
  using (auth.uid() = user_id);

create policy "Users can upsert their own reading goal"
  on public.reading_goals for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own reading goal"
  on public.reading_goals for update
  using (auth.uid() = user_id);

-- One row per completed chapter reading event.
create table if not exists public.reading_chapter_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content_type text not null check (content_type in ('bible', 'book')),
  content_id text not null,
  chapter integer not null,
  completed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, content_type, content_id, chapter, completed_on)
);

create index if not exists reading_chapter_logs_user_date_idx
  on public.reading_chapter_logs (user_id, completed_on desc);

alter table public.reading_chapter_logs enable row level security;

create policy "Users manage their own reading logs"
  on public.reading_chapter_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
