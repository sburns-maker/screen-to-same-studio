-- 0089: incremental appointment and revenue ledger for player-created studio sessions.
-- Requires 0088. Baseline monthly revenue is the studio's unitemized clientele;
-- these are EXTRA sessions, never counted again as generic monthly turnover.
create table if not exists public.finance_studio_sessions (
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null default gen_random_uuid(),
 venture_id uuid not null,
 service text not null check(service in ('portrait','family','branding','rental')),
 session_virtual_date date not null,
 price_cents bigint not null check(price_cents>0),
 deposit_cents bigint not null check(deposit_cents>=0),
 cost_cents bigint not null check(cost_cents>=0),
 status text not null default 'scheduled'
  check(status in ('scheduled','completed','cancelled')),
 booked_at timestamptz not null default now(),
 completed_at timestamptz,
 primary key(user_id,session_id),
 foreign key(user_id,venture_id) references finance_ventures(user_id,venture_id) on delete cascade
);
create index if not exists finance_studio_sessions_schedule on
 finance_studio_sessions(user_id,venture_id,session_virtual_date,status);
alter table public.finance_studio_sessions enable row level security;
revoke all on public.finance_studio_sessions from anon,authenticated;
grant select,insert,update,delete on public.finance_studio_sessions to service_role;

create or replace function public.finance_studio_sessions_snapshot(p_user uuid)
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',session_id,'ventureId',venture_id,'service',service,
  'virtualDate',session_virtual_date::text,'priceCents',price_cents,
  'depositCents',deposit_cents,'costCents',cost_cents,'status',status,
  'bookedAt',booked_at,'completedAt',completed_at)
  order by session_virtual_date desc,booked_at desc),'[]'::jsonb)
 from (select * from finance_studio_sessions where user_id=p_user
  order by booked_at desc limit 100) x;
$$;
revoke all on function public.finance_studio_sessions_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.finance_studio_sessions_snapshot(uuid) to service_role;

create or replace function public.finance_studio_session_action(
 p_user uuid,p_request uuid,p_venture uuid,p_command text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a finance_accounts%rowtype;
 v finance_ventures%rowtype;
 sess finance_studio_sessions%rowtype;
 vday date;
 date_chosen date;
 service_name text;
 price bigint;
 deposit bigint;
 cost bigint;
 slots integer;
 session_uuid uuid;
 note_text text;
begin
 perform finance_initialize(p_user);
 select * into a from finance_accounts where user_id=p_user for update;
 if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request) then
  return finance_studio_sessions_snapshot(p_user); end if;
 select * into v from finance_ventures where user_id=p_user and venture_id=p_venture for update;
 if not found or v.stage<>'operating' or v.asset_key is null then
  raise exception 'Operating studio required'; end if;
 vday:=finance_virtual_date((a.created_at at time zone 'America/New_York')::date,
  (now() at time zone 'America/New_York')::date);
 if p_command='schedule' then
  service_name:=p_payload->>'service';
  if service_name not in ('portrait','family','branding','rental') or service_name is null
  then raise exception 'Unknown photography service'; end if;
  begin
   date_chosen:=(p_payload->>'virtualDate')::date;
  exception when others then raise exception 'Invalid virtual session date';
  end;
  if date_chosen is null or date_chosen<=vday or date_chosen>vday+90
  then raise exception 'Session date must be within the next 90 virtual days'; end if;
  select count(*) into slots from finance_studio_sessions
   where user_id=p_user and venture_id=p_venture and session_virtual_date=date_chosen
    and status='scheduled';
  if slots>=3 then raise exception 'Studio booking capacity reached for that day'; end if;
  price:=case service_name when 'portrait' then 35000 when 'family' then 47500
    when 'branding' then 80000 else 17500 end;
  cost:=case service_name when 'portrait' then 6000 when 'family' then 9500
    when 'branding' then 17000 else 2500 end;
  deposit:=price/4;
  insert into finance_studio_sessions(user_id,venture_id,service,session_virtual_date,
   price_cents,deposit_cents,cost_cents)
   values(p_user,p_venture,service_name,date_chosen,price,deposit,cost)
   returning session_id into session_uuid;
  note_text:='Booked extra '||service_name||' session for virtual '||date_chosen::text||
   '; simulated deposit is held in escrow until completion';
 elsif p_command in ('complete','cancel') then
  begin session_uuid:=(p_payload->>'sessionId')::uuid;
  exception when others then raise exception 'Unknown studio session'; end;
  select * into sess from finance_studio_sessions
   where user_id=p_user and session_id=session_uuid and venture_id=p_venture for update;
  if not found or sess.status<>'scheduled' then raise exception 'Unknown scheduled session'; end if;
  if p_command='complete' then
   if vday<sess.session_virtual_date then raise exception 'Cannot complete a future session'; end if;
   update finance_studio_sessions set status='completed',completed_at=now()
     where user_id=p_user and session_id=session_uuid;
   update finance_assets set company_reserves_cents=company_reserves_cents+
      (sess.price_cents-sess.cost_cents)
     where user_id=p_user and asset_key=v.asset_key and owned=true;
   if not found then raise exception 'Studio ownership changed'; end if;
   note_text:='Completed extra '||sess.service||' studio booking. '||
     'Revenue '||(sess.price_cents/100)::text||' USD and variable costs '||
     (sess.cost_cents/100)::text||' USD added to company reserves';
  else
   if vday>sess.session_virtual_date then raise exception 'Past bookings require completion or dispute review'; end if;
   update finance_studio_sessions set status='cancelled'
     where user_id=p_user and session_id=session_uuid;
   note_text:='Cancelled upcoming '||sess.service||' booking; held simulated deposit released without earnings';
  end if;
 else raise exception 'Unknown studio session action';
 end if;
 insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
 values(p_user,p_request,'studio_'||p_command,v.asset_key,0,a.cash_cents,note_text);
 return finance_studio_sessions_snapshot(p_user);
end $$;
revoke all on function public.finance_studio_session_action(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_studio_session_action(uuid,uuid,uuid,text,jsonb) to service_role;
