create table if not exists public.relationship_evaluations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 message_id uuid not null references public.messages(id) on delete cascade,
 evaluated_at timestamptz not null default now(),
 source_kind text not null default 'conversation',
 context_summary text,
 state_before jsonb not null,
 state_after jsonb not null,
 delta jsonb not null,
 stage_before text not null,
 stage_after text not null,
 observed_tone text,
 event_tags text[] not null default '{}',
 character_perspective text,
 unique (conversation_id,message_id)
);
create index if not exists relationship_evaluations_history on public.relationship_evaluations(user_id,conversation_id,evaluated_at desc);
revoke insert,update,delete on public.relationship_evaluations from authenticated,anon;
grant select on public.relationship_evaluations to authenticated;
grant all on public.relationship_evaluations to service_role;
alter table public.relationship_evaluations enable row level security;
drop policy if exists relationship_evaluations_read on public.relationship_evaluations;
create policy relationship_evaluations_read on public.relationship_evaluations for select to authenticated
using (user_id=(select auth.uid()) and exists (select 1 from public.conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));

create table if not exists public.game_matches (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 match_key text not null,
 game text not null check (game in ('trivia','four','words','pool')),
 status text not null default 'active' check (status in ('active','completed')),
 progress jsonb not null default '{}'::jsonb,
 result jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 effects_applied boolean not null default false,
 unique(user_id,conversation_id,match_key)
);
alter table public.game_matches add column if not exists effects_applied boolean not null default false;
create index if not exists game_matches_resume on public.game_matches(user_id,conversation_id,updated_at desc);
revoke insert, update, delete on public.game_matches from anon, authenticated;
grant select on public.game_matches to authenticated;
grant all on public.game_matches to service_role;
alter table public.game_matches enable row level security;
drop policy if exists game_matches_owner on public.game_matches;
create policy game_matches_owner on public.game_matches for all to authenticated
 using (user_id = (select auth.uid()) and exists (
  select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())
 )) with check (user_id = (select auth.uid()) and exists (
  select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())
 ));

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