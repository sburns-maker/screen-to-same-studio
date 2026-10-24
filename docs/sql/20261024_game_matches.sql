-- Apply to the connected Supabase database before enabling durable game completion.
create table if not exists public.game_matches (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 match_key text not null,
 game text not null check (game in ('trivia','four','words','pool')),
 status text not null default 'active' check (status in ('active','completed')),
 progress jsonb not null default '{}'::jsonb,
 result jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,conversation_id,match_key)
);
create index if not exists game_matches_resume on public.game_matches(user_id,conversation_id,updated_at desc);
alter table public.game_matches enable row level security;
drop policy if exists game_matches_owner on public.game_matches;
create policy game_matches_owner on public.game_matches for all to authenticated
 using (user_id = (select auth.uid()) and exists (
  select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())
 )) with check (user_id = (select auth.uid()) and exists (
  select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())
 ));
-- Result + memory creation is done server-side; clients must not directly write completed matches.
revoke insert, update, delete on public.game_matches from anon, authenticated;
grant select on public.game_matches to authenticated;
