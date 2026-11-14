-- 0088: staged, fictional photography studio ventures.
-- Additive to 0080-0087. Does not modify real employers, legal title or character consent.
create table if not exists public.finance_ventures (
 user_id uuid not null references auth.users(id) on delete cascade,
 venture_id uuid not null default gen_random_uuid(),
 path text not null check(path in ('existing','lease','build')),
 name text not null default 'Sienna Creative Studio',
 stage text not null default 'research' check(stage in ('research','offer_pending','offer_accepted','buildout','operating','cancelled','exited')),
 seller_price_cents bigint not null check(seller_price_cents>0),
 offer_cents bigint,
 settlement_cents bigint,
 base_monthly_revenue_cents bigint not null,
 base_monthly_cost_cents bigint not null,
 inspection_flags integer not null default 0 check(inspection_flags between 0 and 7),
 inspected_at timestamptz,
 offer_due_virtual date,
 offer_expires_virtual date,
 buildout_flags integer not null default 0 check(buildout_flags between 0 and 15),
 marketing_level integer not null default 0 check(marketing_level between 0 and 3),
 operating_style text not null default 'portraits' check(operating_style in ('portraits','hybrid','rental')),
 financing text not null default 'cash' check(financing in ('cash','finance')),
 sienna_involvement text not null default 'not_discussed' check(sienna_involvement in ('not_discussed','invited','not_interested')),
 asset_key text,
 created_at timestamptz not null default now(),
 opened_at timestamptz,
 primary key(user_id,venture_id),
 unique(user_id,asset_key)
);
create unique index if not exists finance_one_active_studio_venture
 on public.finance_ventures(user_id) where stage not in ('cancelled','exited');
create table if not exists public.finance_venture_events (
 user_id uuid not null references auth.users(id) on delete cascade,
 venture_id uuid not null,
 event_id uuid not null default gen_random_uuid(),
 event_type text not null,
 cost_cents bigint not null default 0,
 detail text not null,
 created_at timestamptz not null default now(),
 primary key(user_id,event_id),
 foreign key(user_id,venture_id) references public.finance_ventures(user_id,venture_id) on delete cascade
);
alter table public.finance_ventures enable row level security;
alter table public.finance_venture_events enable row level security;
revoke all on public.finance_ventures,public.finance_venture_events from anon,authenticated;
grant select,insert,update,delete on public.finance_ventures,public.finance_venture_events to service_role;

create or replace function public.finance_venture_snapshot(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 return jsonb_build_object(
 'ventures',coalesce((select jsonb_agg(jsonb_build_object(
  'id',venture_id,'path',path,'name',name,'stage',stage,'askingCents',seller_price_cents,
  'offerCents',offer_cents,'settlementCents',settlement_cents,
  'revenueCents',base_monthly_revenue_cents,'costCents',base_monthly_cost_cents,
  'inspectionFlags',inspection_flags,'buildoutFlags',buildout_flags,
  'marketingLevel',marketing_level,'style',operating_style,'financing',financing,
  'siennaInvolvement',sienna_involvement,'assetKey',asset_key,
  'offerDueVirtual',offer_due_virtual,'offerExpiresVirtual',offer_expires_virtual,
  'createdAt',created_at,'openedAt',opened_at)
  order by created_at desc) from finance_ventures where user_id=p_user),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('ventureId',venture_id,
  'type',event_type,'costCents',cost_cents,'detail',detail,'createdAt',created_at)
  order by created_at desc) from (
   select * from finance_venture_events where user_id=p_user order by created_at desc limit 35
  ) e),'[]'::jsonb)
 );
end $$;
revoke all on function public.finance_venture_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.finance_venture_snapshot(uuid) to service_role;

create or replace function public.finance_venture_action(
 p_user uuid,p_request uuid,p_venture uuid,p_action text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a finance_accounts%rowtype;
 v finance_ventures%rowtype;
 p text;
 n text;
 amount bigint:=0;
 price bigint;
 financing_option text;
 vday date;
 today_local date;
 phase text;
 detail_text text;
 flag integer;
 init_revenue bigint;
 init_cost bigint;
 loan_amount bigint:=0;
 asset_id text;
begin
 perform finance_initialize(p_user);
 select * into a from finance_accounts where user_id=p_user for update;
 if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request)
 then return finance_venture_snapshot(p_user); end if;
 today_local:=(now() at time zone 'America/New_York')::date;
 vday:=finance_virtual_date((a.created_at at time zone 'America/New_York')::date,today_local);
 if p_action='start' then
  if exists(select 1 from finance_ventures where user_id=p_user and stage<>'cancelled')
  then raise exception 'Active photography venture already exists'; end if;
  p:=p_payload->>'path';
  if p not in ('existing','lease','build') or p is null then raise exception 'Choose a studio acquisition path'; end if;
  n:=left(btrim(coalesce(p_payload->>'name','Sienna Creative Studio')),80);
  if length(n)<3 or n ~ '[[:cntrl:]]' then raise exception 'Invalid studio name'; end if;
  insert into finance_ventures(user_id,path,name,seller_price_cents,base_monthly_revenue_cents,base_monthly_cost_cents)
  values(p_user,p,n,
   case p when 'existing' then 13500000 when 'lease' then 650000 when 'build' then 24000000 end,
   case p when 'existing' then 780000 when 'lease' then 380000 when 'build' then 950000 end,
   case p when 'existing' then 280000 when 'lease' then 195000 when 'build' then 330000 end)
  returning * into v;
  detail_text:='Exploring '||p||' studio route, with no property acquired';
 elsif p_action='cancel' then
  select * into v from finance_ventures where user_id=p_user and venture_id=p_venture for update;
  if not found or v.stage not in ('research','offer_pending','offer_accepted') then
   raise exception 'Cannot cancel after closing'; end if;
  update finance_ventures set stage='cancelled' where user_id=p_user and venture_id=p_venture;
  detail_text:='Stopped studio acquisition; completed research fees are not refundable';
 else
  select * into v from finance_ventures where user_id=p_user and venture_id=p_venture for update;
  if not found then raise exception 'Unknown venture'; end if;
  if p_action='inspect' then
   if v.stage<>'research' then raise exception 'Research phase is closed'; end if;
   p:=p_payload->>'check';
   flag:=case p when 'books' then 1 when 'space' then 2 when 'permits' then 4 else 0 end;
   if flag=0 then raise exception 'Unknown due diligence review'; end if;
   if (v.inspection_flags & flag)<>0 then raise exception 'Review already completed'; end if;
   amount:=case flag when 1 then 25000 when 2 then 45000 else 15000 end;
   update finance_ventures set inspection_flags=inspection_flags|flag,inspected_at=now()
     where user_id=p_user and venture_id=p_venture;
   detail_text:=case flag when 1 then 'Reviewed seller books, demand and expenses'
    when 2 then 'Inspected lighting, space and equipment condition'
    else 'Checked lease/permit and business registration assumptions' end;
  elsif p_action='offer' then
   if v.stage<>'research' or v.inspection_flags<>7 then
    raise exception 'Finish all three due diligence checks before offering'; end if;
   price:=(p_payload->>'offerCents')::bigint;
   if price is null or price<v.seller_price_cents*85/100 or price>v.seller_price_cents
   then raise exception 'Offer must be between 85 and 100 percent of asking'; end if;
   financing_option:=p_payload->>'financing';
   if financing_option not in ('cash','finance') or financing_option is null
   then raise exception 'Choose cash or financing'; end if;
   if v.path='lease' and financing_option='finance' then raise exception 'Leases use cash deposits'; end if;
   update finance_ventures set stage='offer_pending',offer_cents=price,
    financing=financing_option,offer_due_virtual=vday+2,offer_expires_virtual=vday+28
     where user_id=p_user and venture_id=p_venture;
   detail_text:='Submitted binding-in-game offer; seller response available after two virtual days';
  elsif p_action='respond' then
   if v.stage<>'offer_pending' then raise exception 'No pending offer'; end if;
   if vday<v.offer_due_virtual then raise exception 'Seller has not responded yet'; end if;
   if vday>v.offer_expires_virtual then
    update finance_ventures set stage='research',offer_cents=null,offer_due_virtual=null,offer_expires_virtual=null
     where user_id=p_user and venture_id=p_venture;
    detail_text:='Offer expired; review terms and submit a new one';
   else
    -- Deterministic counteroffer: favorable terms if within 5% of asking.
    price:=case when v.offer_cents>=v.seller_price_cents*95/100
     then v.offer_cents else (v.offer_cents+v.seller_price_cents)/2 end;
    update finance_ventures set stage='offer_accepted',settlement_cents=price
     where user_id=p_user and venture_id=p_venture;
    detail_text:=case when price=v.offer_cents then 'Seller accepted the offer'
      else 'Seller countered; final closing price is the midpoint of the offer and asking price' end;
   end if;
  elsif p_action='close' then
   if v.stage<>'offer_accepted' then raise exception 'An accepted offer is required'; end if;
   price:=v.settlement_cents;
   loan_amount:=case when v.financing='finance' then price*75/100 else 0 end;
   amount:=price-loan_amount+case when v.path='lease' then 65000 else 195000 end;
   if a.cash_cents<amount then raise exception 'Insufficient fictional cash for closing and fees'; end if;
   asset_id:='venture:photo:'||v.venture_id::text;
   insert into finance_assets(user_id,asset_key,label,category,workplace_key,
    price_cents,monthly_profit_cents,baseline_revenue_cents,monthly_cost_cents,
    staff_count,owned,owner_since,loan_cents,loan_months_left,owner_draw_pct)
   values(p_user,asset_id,v.name,'business',null,price,0,0,0,
    0,true,now(),loan_amount,case when loan_amount>0 then 120 else 0 end,50);
   update finance_ventures set stage='buildout',asset_key=asset_id where user_id=p_user and venture_id=p_venture;
   detail_text:='Closed deal and paid fees; studio not yet open or earning bookings';
  elsif p_action='upgrade' then
   if v.stage not in ('buildout','operating') then raise exception 'Studio must be acquired first'; end if;
   p:=p_payload->>'upgrade';
   flag:=case p when 'lighting' then 1 when 'editing' then 2 when 'interior' then 4 when 'booking' then 8 else 0 end;
   if flag=0 then raise exception 'Unknown studio upgrade'; end if;
   if (v.buildout_flags & flag)<>0 then raise exception 'Upgrade already installed'; end if;
   amount:=case flag when 1 then 185000 when 2 then 145000 when 4 then 250000 else 95000 end;
   update finance_ventures set buildout_flags=buildout_flags|flag where user_id=p_user and venture_id=p_venture;
   detail_text:='Installed '||p||' buildout package';
   if v.stage='operating' then
    update finance_assets set monthly_profit_cents=monthly_profit_cents+
      case flag when 1 then 60000 when 2 then 45000 when 4 then 55000 else 85000 end,
      baseline_revenue_cents=baseline_revenue_cents+
      case flag when 1 then 60000 when 2 then 45000 when 4 then 55000 else 85000 end
    where user_id=p_user and asset_key=v.asset_key;
   end if;
  elsif p_action='launch' then
   if v.stage<>'buildout' or (v.buildout_flags & 1)=0 or (v.buildout_flags & 8)=0 then
    raise exception 'Launch requires lighting and a booking system'; end if;
   p:=p_payload->>'style';
   if p not in ('portraits','hybrid','rental') or p is null then raise exception 'Choose a business model'; end if;
   init_revenue:=v.base_monthly_revenue_cents+
    (case when (v.buildout_flags & 1)<>0 then 60000 else 0 end)+
    (case when (v.buildout_flags & 2)<>0 then 45000 else 0 end)+
    (case when (v.buildout_flags & 4)<>0 then 55000 else 0 end)+
    (case when (v.buildout_flags & 8)<>0 then 85000 else 0 end)+
    (case p when 'hybrid' then 120000 when 'rental' then 65000 else 0 end);
   init_cost:=v.base_monthly_cost_cents+
    (case p when 'hybrid' then 50000 when 'rental' then 20000 else 0 end);
   update finance_assets set monthly_profit_cents=init_revenue,
    baseline_revenue_cents=init_revenue,monthly_cost_cents=init_cost,
    owner_since=now() where user_id=p_user and asset_key=v.asset_key;
   update finance_ventures set stage='operating',operating_style=p,opened_at=now()
    where user_id=p_user and venture_id=p_venture;
   detail_text:='Studio opened with real simulated revenue, operating expenses and owner distributions';
  elsif p_action='market' then
   if v.stage<>'operating' or v.marketing_level>=3 then raise exception 'Marketing plan not available'; end if;
   amount:=120000+v.marketing_level*50000;
   update finance_ventures set marketing_level=marketing_level+1 where user_id=p_user and venture_id=p_venture;
   update finance_assets set monthly_profit_cents=monthly_profit_cents+85000,
    baseline_revenue_cents=baseline_revenue_cents+85000,
    monthly_cost_cents=monthly_cost_cents+35000 where user_id=p_user and asset_key=v.asset_key;
   detail_text:='Started sustained local marketing campaign with higher bookings and recurring ad spend';
  elsif p_action='invite_sienna' then
   if v.stage in ('cancelled','exited') or v.sienna_involvement<>'not_discussed' then
    raise exception 'Sienna invitation already recorded or venture cancelled'; end if;
   update finance_ventures set sienna_involvement='invited' where user_id=p_user and venture_id=p_venture;
   detail_text:='Player wishes to discuss creative role with Sienna; this is NOT acceptance or employment';
  else
   raise exception 'Unknown venture action';
  end if;
 end if;
 if amount>a.cash_cents then raise exception 'Insufficient fictional cash for this stage'; end if;
 if amount>0 then update finance_accounts set cash_cents=cash_cents-amount
  where user_id=p_user returning * into a; end if;
 insert into finance_venture_events(user_id,venture_id,event_type,cost_cents,detail)
  values(p_user,v.venture_id,p_action,amount,detail_text);
 insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
 values(p_user,p_request,'venture_'||p_action,
  case when p_action in ('close','launch','upgrade','market') then
    (select asset_key from finance_ventures where user_id=p_user and venture_id=v.venture_id) else null end,
  -amount,a.cash_cents,detail_text);
 return finance_venture_snapshot(p_user);
end $$;
revoke all on function public.finance_venture_action(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_venture_action(uuid,uuid,uuid,text,jsonb) to service_role;

-- Selling a fully acquired studio through the existing asset-sale workflow must
-- also close the venture, so it cannot continue generating fictional bookings.
create or replace function public.finance_venture_sync_sale()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.owned=true and new.owned=false then
  update finance_ventures set stage='exited'
    where user_id=new.user_id and asset_key=new.asset_key and stage in ('buildout','operating');
  insert into finance_venture_events(user_id,venture_id,event_type,cost_cents,detail)
    select new.user_id,venture_id,'exit',0,
      'Player sold the studio via normal finance asset sale; venture archived'
    from finance_ventures where user_id=new.user_id and asset_key=new.asset_key and stage='exited';
 end if;
 return new;
end $$;
revoke all on function public.finance_venture_sync_sale() from public,anon,authenticated;
drop trigger if exists finance_venture_sync_sale on public.finance_assets;
create trigger finance_venture_sync_sale after update of owned on public.finance_assets
 for each row execute function public.finance_venture_sync_sale();
