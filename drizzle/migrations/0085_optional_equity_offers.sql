-- 0085: private OPTIONAL in-game co-ownership offers; creating an offer
-- never transfers ownership, generates a marriage obligation, or changes payouts.
create table if not exists public.finance_equity_offers (
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null default gen_random_uuid(),
  asset_key text not null,
  recipient_character text not null,
  percentage integer not null check (percentage between 1 and 50),
  status text not null default 'pending' check(status in ('pending','withdrawn')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  primary key(user_id,offer_id),
  foreign key(user_id,asset_key) references finance_assets(user_id,asset_key) on delete cascade
);
create unique index if not exists finance_one_pending_equity_offer
 on public.finance_equity_offers(user_id,asset_key,recipient_character)
 where status='pending';
alter table public.finance_equity_offers enable row level security;
revoke all on public.finance_equity_offers from anon,authenticated;
grant select,insert,update,delete on public.finance_equity_offers to service_role;

create or replace function public.finance_equity_offers_snapshot(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'offerId',o.offer_id,'assetKey',o.asset_key,
   'characterKey',o.recipient_character,'percentage',o.percentage,
   'status',o.status,'createdAt',o.created_at) order by o.created_at desc)
  from finance_equity_offers o where o.user_id=p_user
 ),'[]'::jsonb);
end $$;
revoke all on function public.finance_equity_offers_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.finance_equity_offers_snapshot(uuid) to service_role;

create or replace function public.finance_equity_offer_command(
 p_user uuid,p_request uuid,p_action text,p_asset text,p_character text,p_offer uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a finance_accounts%rowtype;
begin
 perform finance_initialize(p_user);
 select * into a from finance_accounts where user_id=p_user for update;
 if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request)
 then return finance_equity_offers_snapshot(p_user); end if;
 if p_action='offer_half' then
  if p_character is null or p_character not in
    ('tess','maya','claire','jordan','ben','sienna','kendra','riley','carly','brooke','jade','nina')
  then raise exception 'Unknown character'; end if;
  if not exists(select 1 from finance_assets where user_id=p_user and
    asset_key=p_asset and category='business' and owned=true)
  then raise exception 'Owned operating business required'; end if;
  if not exists(select 1 from finance_governance where user_id=p_user and
    asset_key=p_asset and hands_off=true)
  then raise exception 'Save hands-off governance before proposing co-ownership'; end if;
  if exists(select 1 from finance_equity_offers where user_id=p_user and
    asset_key=p_asset and recipient_character=p_character and status='pending')
  then raise exception 'An unanswered offer already exists'; end if;
  insert into finance_equity_offers(user_id,asset_key,recipient_character,percentage)
  values(p_user,p_asset,p_character,50);
 elsif p_action='withdraw' then
  update finance_equity_offers set status='withdrawn',closed_at=now()
  where user_id=p_user and offer_id=p_offer and status='pending';
  if not found then raise exception 'No outstanding offer to withdraw'; end if;
 else raise exception 'Unknown offer action'; end if;
 insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
 values(p_user,p_request,'equity_'||p_action,p_asset,0,a.cash_cents,
   'Fictional optional co-ownership proposal; no equity changed');
 return finance_equity_offers_snapshot(p_user);
end $$;
revoke all on function public.finance_equity_offer_command(uuid,uuid,text,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.finance_equity_offer_command(uuid,uuid,text,text,text,uuid)
 to service_role;
