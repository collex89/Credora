-- ====================================================================
-- Credora migration 027: 3-hour edit window on posts
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- ====================================================================
--
-- The "Users can edit their own posts" policy from migration 013 checked
-- only auth.uid() = author_id, with no time limit -- a post could be
-- rewritten at any point after posting, no matter how old. This is the
-- real enforcement: the app also hides the Edit Post option client-side
-- once a post is more than 3 hours old (see canEditPost in App.jsx), but
-- that's UX, not security -- the anon key is public, so nothing stops a
-- request that skips the UI entirely and calls Supabase directly. RLS is
-- what actually stops the write.
drop policy if exists "Users can edit their own posts" on public.posts;

create policy "Users can edit their own posts within 3 hours"
  on public.posts for update
  using (auth.uid() = author_id and created_at > now() - interval '3 hours')
  with check (auth.uid() = author_id and created_at > now() - interval '3 hours');
