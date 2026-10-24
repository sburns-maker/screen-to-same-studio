-- Append-only character relationship evaluations, scoped to their owner.
create table if not exists public.relationship_evaluations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
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
alter table public.relationship_evaluations enable row level security;
drop policy if exists relationship_evaluations_read on public.relationship_evaluations;
create policy relationship_evaluations_read on public.relationship_evaluations for select to authenticated
using (user_id=(select auth.uid()) and exists (select 1 from public.conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));
revoke insert,update,delete on public.relationship_evaluations from authenticated,anon;
grant select on public.relationship_evaluations to authenticated;
-- The server's trusted service-role client writes; browser clients never fabricate evaluations.
