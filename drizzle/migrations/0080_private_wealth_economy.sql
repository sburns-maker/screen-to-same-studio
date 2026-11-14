-- Living World virtual economy. All funds/businesses are fictional. Execute in migration order.
create table if not exists public.finance_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cash_cents bigint not null default 500000000000 check (cash_cents >= 0),
  investments_cents bigint not null default 300000000000 check (investments_cents >= 0),
  wealth_visibility text not null default 'private' check (wealth_visibility in ('private','disclosed')),
  created_at timestamptz not null default now()
);
create table if not exists public.finance_assets (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_key text not null,
  label text not null,
  category text not null check (category in ('business','residential','commercial')),
  workplace_key text,
  price_cents bigint not null check (price_cents > 0),
  monthly_profit_cents bigint not null default 0,
  baseline_revenue_cents bigint not null default 0,
  company_reserves_cents bigint not null default 0 check(company_reserves_cents >= 0),
  owner_draw_pct integer not null default 60 check(owner_draw_pct between 0 and 100),
  monthly_cost_cents bigint not null default 0,
  staff_count integer not null default 0,
  owner_since timestamptz,
  loan_cents bigint not null default 0 check (loan_cents >= 0),
  loan_rate_bps integer not null default 800,
  loan_months_left integer not null default 0,
  owned boolean not null default false,
  primary key (user_id, asset_key)
);
create table if not exists public.finance_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  event_type text not null,
  asset_key text,
  amount_cents bigint not null,
  cash_after_cents bigint not null check (cash_after_cents >= 0),
  note text not null,
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create index if not exists finance_ledger_recent_idx on public.finance_ledger(user_id,created_at desc);
create table if not exists public.finance_cycles (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_key text not null,
  cycle_month date not null,
  applied_at timestamptz not null default now(),
  primary key(user_id,asset_key,cycle_month),
  foreign key(user_id,asset_key) references public.finance_assets(user_id,asset_key) on delete cascade
);
alter table public.finance_accounts enable row level security;
alter table public.finance_assets enable row level security;
alter table public.finance_ledger enable row level security;
alter table public.finance_cycles enable row level security;
-- Finance visibility is owned by a server function, not by public table reads.
revoke all on public.finance_accounts, public.finance_assets, public.finance_ledger, public.finance_cycles from anon, authenticated;
grant select,insert,update,delete on public.finance_accounts, public.finance_assets, public.finance_ledger, public.finance_cycles to service_role;


-- Named staff belong only to a fictional player's world, not a real employer payroll.
create table if not exists public.finance_workers (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_key text not null,
  worker_key text not null,
  display_name text not null,
  role text not null,
  salary_cents bigint not null check (salary_cents between 0 and 50000000000),
  character_key text,
  active boolean not null default true,
  primary key(user_id,asset_key,worker_key),
  foreign key(user_id,asset_key) references finance_assets(user_id,asset_key) on delete cascade
);
create table if not exists public.finance_income_cycles (
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_month date not null,
  created_at timestamptz not null default now(),
  primary key (user_id,cycle_month)
);
alter table public.finance_workers enable row level security;
alter table public.finance_income_cycles enable row level security;
revoke all on public.finance_workers,public.finance_income_cycles from anon,authenticated;
grant select,insert,update,delete on public.finance_workers,public.finance_income_cycles to service_role;

create or replace function public.finance_initialize(p_user uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  insert into finance_accounts(user_id) values(p_user) on conflict do nothing;
  insert into finance_assets(user_id,asset_key,label,category,workplace_key,price_cents,monthly_profit_cents,monthly_cost_cents,staff_count)
  values
    (p_user,'work:after-dark','After Dark','business','work:carly',42500000,9000000,2200000,14),
    (p_user,'work:northlight','Northlight Studio','business','work:kendra',18500000,4200000,850000,5),
    (p_user,'work:copper-lens','Copper Lens Cocktail Bar','business','work:sienna',31000000,6800000,1600000,11),
    (p_user,'property:riverview','Riverview Townhouse','residential',null,29500000,0,35000,0),
    (p_user,'property:market-street','Market Street Retail Building','commercial',null,69000000,1800000,350000,0)
,
    (p_user,'work:upmc-altoona','UPMC Altoona','business','work:riley',200000000000,5000000000,400000000,4500),
    (p_user,'work:altoona-library','Altoona Area Public Library','business','work:claire',1400000000,50000000,15000000,35),
    (p_user,'work:convention-center','Blair County Convention Center','business','work:maya',2400000000,140000000,34000000,60),
    (p_user,'work:eads','The EADS Group','business','work:jordan',16000000000,900000000,110000000,400),
    (p_user,'work:sp-mccarl','S.P. McCarl & Company','business','work:ben',6700000000,500000000,55000000,135),
    (p_user,'work:loganm','Logan Valley Mall','commercial',null,7800000000,140000000,25000000,70),
    (p_user,'work:sheetz-chestnut','Sheetz – Chestnut Avenue','business',null,890000000,95000000,11000000,22),
    (p_user,'work:sheetz-plank','Sheetz – Plank Road','business',null,1100000000,110000000,13000000,27),
    (p_user,'work:curve-field','Peoples Natural Gas Field','business',null,4700000000,180000000,20000000,50),
    (p_user,'work:railroad-museum','Railroaders Memorial Museum','business',null,1200000000,40000000,6500000,20),
    (p_user,'work:mishler','Mishler Theatre','business',null,1700000000,70000000,13000000,30),
    (p_user,'work:lakemont','Lakemont Park','business',null,4100000000,105000000,16000000,75),
    (p_user,'work:pennstate-altoona','Penn State Altoona','business',null,98000000000,1800000000,350000000,1150),
    (p_user,'work:harbor-point','Harbor Point Recovery Center','business','work:jade',1850000000,120000000,16000000,45),
    (p_user,'work:victorias-secret','Victoria’s Secret – Altoona','business','work:nina',390000000,51000000,8500000,14),
    (p_user,'work:pleasant-valley-vet','Pleasant Valley Animal Hospital','business','work:tess',620000000,70000000,12000000,18),
    (p_user,'property:downtown-loft','Downtown Altoona Loft Apartments','residential',null,380000000,24000000,5000000,0),
    (p_user,'property:commercial-tower','Altoona Commercial Tower','commercial',null,3800000000,80000000,10000000,0),
    (p_user,'property:office-park','Blair County Office Park','commercial',null,6300000000,130000000,18000000,0),
    (p_user,'work:altoona-diner','Altoona Downtown Diner','business',null,90000000,16500000,3200000,9),
    (p_user,'work:green-bean','Green Bean Coffee House','business',null,120000000,20000000,4200000,10),
    (p_user,'work:delgrossos','DelGrosso’s Park','business',null,9500000000,240000000,35000000,180),
    (p_user,'work:horseshoe-curve','Horseshoe Curve Visitor Attraction','business',null,1600000000,60000000,10000000,20)
  on conflict do nothing;
  update finance_assets set baseline_revenue_cents=monthly_profit_cents
  where user_id=p_user and baseline_revenue_cents=0;
  insert into finance_workers(user_id,asset_key,worker_key,display_name,role,salary_cents,character_key)
  values
    (p_user,'work:upmc-altoona','riley','Riley','Clinical staff',708333,'riley'),
    (p_user,'work:altoona-library','claire','Claire','Librarian',408333,'claire'),
    (p_user,'work:convention-center','maya','Maya','Events coordinator',475000,'maya'),
    (p_user,'work:eads','jordan','Jordan','Engineer',1000000,'jordan'),
    (p_user,'work:sp-mccarl','ben','Ben','HVAC technician',558333,'ben'),
    (p_user,'work:after-dark','carly','Carly','Dancer / bartender',400000,'carly'),
    (p_user,'work:after-dark','brooke','Brooke','Dancer',383333,'brooke'),
    (p_user,'work:copper-lens','sienna','Sienna','Bartender',350000,'sienna'),
    (p_user,'work:northlight','kendra','Kendra','Photographer',533333,'kendra'),
    (p_user,'work:harbor-point','jade','Jade','Program manager',650000,'jade'),
    (p_user,'work:victorias-secret','nina','Nina','Retail associate',325000,'nina'),
    (p_user,'work:pleasant-valley-vet','tess','Tess','Veterinary staff',516667,'tess')
  on conflict do nothing;
end $$;
revoke all on function public.finance_initialize(uuid) from public,anon,authenticated;
grant execute on function public.finance_initialize(uuid) to service_role;

create or replace function public.finance_snapshot(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype;
begin
  perform finance_initialize(p_user);
  select * into a from finance_accounts where user_id=p_user;
  return jsonb_build_object(
    'cashCents',a.cash_cents,'investmentsCents',a.investments_cents,
    'visibility',a.wealth_visibility,
    'playerSalaryCents',10000000,
    'workers',coalesce((select jsonb_agg(jsonb_build_object('key',worker_key,'assetKey',asset_key,'name',display_name,'role',role,'salaryCents',salary_cents,'characterKey',character_key,'active',active) order by asset_key,display_name) from finance_workers where user_id=p_user),'[]'::jsonb),
    'assets',coalesce((select jsonb_agg(jsonb_build_object(
      'key',asset_key,'label',label,'category',category,'workplaceKey',workplace_key,
      'priceCents',price_cents,'monthlyProfitCents',monthly_profit_cents,
      'monthlyCostCents',monthly_cost_cents,'staffCount',staff_count,
      'baselineRevenueCents',baseline_revenue_cents,'companyReservesCents',company_reserves_cents,'ownerDrawPct',owner_draw_pct,
      'owned',owned,'loanCents',loan_cents,'loanMonthsLeft',loan_months_left,
      'ownerSince',owner_since) order by category,label) from finance_assets where user_id=p_user),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(to_jsonb(l) order by created_at desc)
      from (select event_type,amount_cents,cash_after_cents,asset_key,note,created_at from finance_ledger where user_id=p_user order by created_at desc limit 30) l),'[]'::jsonb)
  );
end $$;
revoke all on function public.finance_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.finance_snapshot(uuid) to service_role;

create or replace function public.finance_action(p_user uuid,p_request uuid,p_action text,p_asset text,p_finance boolean default false)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype; b finance_assets%rowtype;
  amount bigint; debt bigint; value bigint; event_name text; note_text text;
begin
  perform finance_initialize(p_user);
  select * into a from finance_accounts where user_id=p_user for update;
  if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request) then
    return finance_snapshot(p_user);
  end if;
  if p_action='disclose' then
    update finance_accounts set wealth_visibility='disclosed' where user_id=p_user;
    event_name:='disclose'; amount:=0; note_text:='Player explicitly disclosed their finances';
  elsif p_action='hide' then
    update finance_accounts set wealth_visibility='private' where user_id=p_user;
    event_name:='hide'; amount:=0; note_text:='Player restored private wealth visibility';
  else
    select * into b from finance_assets where user_id=p_user and asset_key=p_asset for update;
    if not found then raise exception 'Unknown fictional asset'; end if;
    if p_action='purchase' and not b.owned then
      debt:=case when p_finance then b.price_cents*75/100 else 0 end;
      amount:=-(b.price_cents-debt);
      if a.cash_cents+amount<0 then raise exception 'Insufficient fictional funds'; end if;
      update finance_assets set owned=true,owner_since=now(),loan_cents=debt,company_reserves_cents=0,
        loan_months_left=case when p_finance then 120 else 0 end where user_id=p_user and asset_key=p_asset;
      event_name:='purchase'; note_text:='Acquired '||b.label||case when p_finance then ' with 25% down' else ' outright' end;
    elsif p_action='sell' and b.owned then
      -- fixed book-value resale in first version; no speculation-driven gains.
      amount:=b.price_cents-b.loan_cents+b.company_reserves_cents;
      update finance_assets set owned=false,owner_since=null,loan_cents=0,loan_months_left=0,company_reserves_cents=0
      where user_id=p_user and asset_key=p_asset;
      event_name:='sale';note_text:='Sold '||b.label||' at listed value, repaid loan and distributed retained reserves';
    else
      raise exception 'Asset action not allowed';
    end if;
  end if;
  update finance_accounts set cash_cents=cash_cents+amount where user_id=p_user
  returning * into a;
  insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
  values(p_user,p_request,event_name,p_asset,amount,a.cash_cents,note_text);
  return finance_snapshot(p_user);
end $$;
revoke all on function public.finance_action(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.finance_action(uuid,uuid,text,text,boolean) to service_role;

create or replace function public.finance_monthly_tick(p_user uuid,p_today date default current_date)
returns integer language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype; b finance_assets%rowtype; m date;
  cash_delta bigint; principal_payment bigint; interest_payment bigint; applied integer:=0; payroll bigint; named_count integer;
  gross bigint; draw_amount bigint; shortfall bigint; months_owned integer;
begin
  -- Background jobs must not create a millionaire account for users who never opted into finances.
  if not exists(select 1 from finance_accounts where user_id=p_user) then return 0; end if;
  select * into a from finance_accounts where user_id=p_user for update;
  -- Settlements are bounded to 12 completed months per request, never future months.
  for b in select * from finance_assets where user_id=p_user and owned=true for update loop
    for m in select gs::date from generate_series(
      greatest(date_trunc('month',coalesce(b.owner_since,now()))::date, (date_trunc('month',p_today)-interval '12 months')::date),
      (date_trunc('month',p_today)-interval '1 month')::date,interval '1 month') gs loop
      insert into finance_cycles(user_id,asset_key,cycle_month) values(p_user,b.asset_key,m)
      on conflict do nothing;
      if not found then continue; end if;
      interest_payment:=case when b.loan_cents>0 then (b.loan_cents*b.loan_rate_bps+119999)/120000 else 0 end;
      principal_payment:=case when b.loan_months_left>0 then (b.loan_cents+b.loan_months_left-1)/b.loan_months_left else 0 end;
      select coalesce(sum(salary_cents),0),count(*) into payroll,named_count from finance_workers where user_id=p_user and asset_key=b.asset_key and active;
      payroll:=payroll+greatest(0,b.staff_count-named_count)*300000;
      -- Revenue grows by 2% at three-month ownership milestones, capped at 200% of the initial revenue.
      months_owned:=greatest(0,((extract(year from age(m,b.owner_since::date))::int)*12+
        extract(month from age(m,b.owner_since::date))::int));
      gross:=b.monthly_profit_cents;
      if months_owned>0 and mod(months_owned,3)=0 then
        gross:=least(ceil(gross*1.02)::bigint,b.baseline_revenue_cents*2);
      end if;
      cash_delta:=gross-b.monthly_cost_cents-payroll-principal_payment-interest_payment;
      if cash_delta>=0 then
        draw_amount:=floor(cash_delta*b.owner_draw_pct/100.0)::bigint;
        update finance_assets set company_reserves_cents=company_reserves_cents+cash_delta-draw_amount,
          monthly_profit_cents=gross,loan_cents=greatest(0,loan_cents-principal_payment),
          loan_months_left=greatest(0,loan_months_left-1)
        where user_id=p_user and asset_key=b.asset_key;
        update finance_accounts set cash_cents=cash_cents+draw_amount
          where user_id=p_user returning * into a;
      else
        shortfall:=greatest(0,-cash_delta-b.company_reserves_cents);
        if a.cash_cents<shortfall then raise exception 'Unable to cover business operating deficit'; end if;
        draw_amount:=-shortfall;
        update finance_assets set company_reserves_cents=greatest(0,company_reserves_cents+cash_delta),
          monthly_profit_cents=gross,loan_cents=greatest(0,loan_cents-principal_payment),
          loan_months_left=greatest(0,loan_months_left-1)
        where user_id=p_user and asset_key=b.asset_key;
        update finance_accounts set cash_cents=cash_cents-shortfall
          where user_id=p_user returning * into a;
      end if;
      insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
      values(p_user,gen_random_uuid(),'monthly_settlement',b.asset_key,draw_amount,a.cash_cents,
        'Operations / net '||(cash_delta/100)::text||' USD, owner draw '||(draw_amount/100)::text||' USD, month '||to_char(m,'YYYY-MM'));
      b.company_reserves_cents:=case when cash_delta>=0 then b.company_reserves_cents+cash_delta-draw_amount else greatest(0,b.company_reserves_cents+cash_delta) end;
      b.monthly_profit_cents:=gross;
      b.loan_cents:=greatest(0,b.loan_cents-principal_payment);
      b.loan_months_left:=greatest(0,b.loan_months_left-1);
      applied:=applied+1;
    end loop;
  end loop;
  -- Player salary arrives monthly irrespective of asset ownership, but only once.
  for m in select gs::date from generate_series(
    greatest(date_trunc('month',a.created_at)::date,(date_trunc('month',p_today)-interval '12 months')::date),
    (date_trunc('month',p_today)-interval '1 month')::date,interval '1 month') gs loop
    insert into finance_income_cycles(user_id,cycle_month) values(p_user,m) on conflict do nothing;
    if found then
      update finance_accounts set cash_cents=cash_cents+10000000 where user_id=p_user returning * into a;
      insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
      values(p_user,gen_random_uuid(),'player_salary',null,10000000,a.cash_cents,'Virtual executive salary '||to_char(m,'YYYY-MM'));
      applied:=applied+1;
    end if;
  end loop;
  return applied;
end $$;
revoke all on function public.finance_monthly_tick(uuid,date) from public,anon,authenticated;
grant execute on function public.finance_monthly_tick(uuid,date) to service_role;


-- Owners may set character pay without controlling a character's personal autonomy or private data.
create or replace function public.finance_set_salary(p_user uuid,p_request uuid,p_asset text,p_worker text,p_salary bigint)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype;
begin
  if p_salary<0 or p_salary>50000000000 then raise exception 'Salary out of bounds'; end if;
  perform finance_initialize(p_user);
  select * into a from finance_accounts where user_id=p_user for update;
  if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request) then return finance_snapshot(p_user); end if;
  if not exists(select 1 from finance_assets where user_id=p_user and asset_key=p_asset and owned) then raise exception 'Business ownership required'; end if;
  update finance_workers set salary_cents=p_salary where user_id=p_user and asset_key=p_asset and worker_key=p_worker and active=true;
  if not found then raise exception 'Unknown active employee'; end if;
  insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
  values(p_user,p_request,'salary_change',p_asset,0,a.cash_cents,'Updated virtual salary for '||p_worker);
  return finance_snapshot(p_user);
end $$;
revoke all on function public.finance_set_salary(uuid,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.finance_set_salary(uuid,uuid,text,text,bigint) to service_role;

create or replace function public.finance_owner_draw(p_user uuid,p_request uuid,p_asset text,p_amount bigint)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype; b finance_assets%rowtype;
begin
  if p_amount<=0 then raise exception 'Draw must be positive'; end if;
  perform finance_initialize(p_user);
  select * into a from finance_accounts where user_id=p_user for update;
  if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request) then return finance_snapshot(p_user); end if;
  select * into b from finance_assets where user_id=p_user and asset_key=p_asset for update;
  if not found or not b.owned then raise exception 'Owned business required'; end if;
  if b.company_reserves_cents<p_amount then raise exception 'Not enough company reserves'; end if;
  update finance_assets set company_reserves_cents=company_reserves_cents-p_amount where user_id=p_user and asset_key=p_asset;
  update finance_accounts set cash_cents=cash_cents+p_amount where user_id=p_user returning * into a;
  insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
  values(p_user,p_request,'owner_draw',p_asset,p_amount,a.cash_cents,'Personal owner draw from '||b.label);
  return finance_snapshot(p_user);
end $$;
revoke all on function public.finance_owner_draw(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.finance_owner_draw(uuid,uuid,text,bigint) to service_role;

create or replace function public.finance_set_draw_rate(p_user uuid,p_request uuid,p_asset text,p_rate integer)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype;
begin
  if p_rate<0 or p_rate>100 then raise exception 'Draw percent must be 0 to 100'; end if;
  perform finance_initialize(p_user);
  select * into a from finance_accounts where user_id=p_user for update;
  if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request) then return finance_snapshot(p_user); end if;
  update finance_assets set owner_draw_pct=p_rate where user_id=p_user and asset_key=p_asset and owned;
  if not found then raise exception 'Owned business required'; end if;
  insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
  values(p_user,p_request,'draw_policy',p_asset,0,a.cash_cents,'Owner draw percentage changed to '||p_rate||'%');
  return finance_snapshot(p_user);
end $$;
revoke all on function public.finance_set_draw_rate(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.finance_set_draw_rate(uuid,uuid,text,integer) to service_role;
