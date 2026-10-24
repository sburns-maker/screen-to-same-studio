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

-- One-time completion side effects. Service-role only, serialized per match.
alter table public.game_matches add column if not exists effects_applied boolean not null default false;
create or replace function public.finalize_game_match(p_id uuid,p_user_id uuid,p_summary text)
returns void
language plpgsql security definer set search_path = public
as $$
declare m public.game_matches%rowtype;
begin
 select * into m from public.game_matches where id=p_id and user_id=p_user_id for update;
 if not found or m.status <> 'completed' then raise exception 'Unverified game match'; end if;
 if m.effects_applied then return; end if;
 insert into public.memories(id,user_id,conversation_id,memory_type,summary,importance)
 values(m.id,m.user_id,m.conversation_id,'shared_game',left(p_summary,1000),3)
 on conflict(id) do nothing;
 update public.tess_state
   set playfulness=least(100,playfulness+1),
       relationship_momentum=least(100,relationship_momentum+1),
       updated_at=now()
 where conversation_id=m.conversation_id and user_id=m.user_id;
 update public.game_matches set effects_applied=true where id=m.id;
end $$;
revoke all on function public.finalize_game_match(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_game_match(uuid,uuid,text) to service_role;
