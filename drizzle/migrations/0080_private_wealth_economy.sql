-- Living World virtual economy. All funds/businesses are fictional. Execute in migration order.
create table if not exists public.finance_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cash_cents bigint not null default 2500000000 check (cash_cents >= 0),
  investments_cents bigint not null default 1500000000 check (investments_cents >= 0),
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

create or replace function public.finance_initialize(p_user uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  insert into finance_accounts(user_id) values(p_user) on conflict do nothing;
  insert into finance_assets(user_id,asset_key,label,category,workplace_key,price_cents,monthly_profit_cents,monthly_cost_cents,staff_count)
  values
    (p_user,'work:after-dark','After Dark','business','work:carly',42500000,620000,0,14),
    (p_user,'work:northlight','Northlight Studio','business','work:kendra',18500000,240000,0,5),
    (p_user,'work:copper-lens','Copper Lens Cocktail Bar','business','work:sienna',31000000,410000,0,11),
    (p_user,'property:riverview','Riverview Townhouse','residential',null,29500000,0,35000,0),
    (p_user,'property:market-street','Market Street Retail Building','commercial',null,69000000,725000,130000,0)
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
    'assets',coalesce((select jsonb_agg(jsonb_build_object(
      'key',asset_key,'label',label,'category',category,'workplaceKey',workplace_key,
      'priceCents',price_cents,'monthlyProfitCents',monthly_profit_cents,
      'monthlyCostCents',monthly_cost_cents,'staffCount',staff_count,
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
      update finance_assets set owned=true,owner_since=now(),loan_cents=debt,
        loan_months_left=case when p_finance then 120 else 0 end where user_id=p_user and asset_key=p_asset;
      event_name:='purchase'; note_text:='Acquired '||b.label||case when p_finance then ' with 25% down' else ' outright' end;
    elsif p_action='sell' and b.owned then
      -- fixed book-value resale in first version; no speculation-driven gains.
      amount:=b.price_cents-b.loan_cents;
      update finance_assets set owned=false,owner_since=null,loan_cents=0,loan_months_left=0
      where user_id=p_user and asset_key=p_asset;
      event_name:='sale';note_text:='Sold '||b.label||' at listed value; outstanding loan repaid';
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
  cash_delta bigint; principal_payment bigint; interest_payment bigint; applied integer:=0;
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
      cash_delta:=b.monthly_profit_cents-b.monthly_cost_cents-principal_payment-interest_payment;
      -- A failed month must not silently create negative cash.
      if a.cash_cents+cash_delta<0 then raise exception 'Business expenses exceed available fictional cash'; end if;
      update finance_accounts set cash_cents=cash_cents+cash_delta where user_id=p_user returning * into a;
      update finance_assets set loan_cents=greatest(0,loan_cents-principal_payment),
        loan_months_left=greatest(0,loan_months_left-1) where user_id=p_user and asset_key=b.asset_key;
      insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
      values(p_user,gen_random_uuid(),'monthly_settlement',b.asset_key,cash_delta,a.cash_cents,'Monthly operations '||to_char(m,'YYYY-MM'));
      b.loan_cents:=greatest(0,b.loan_cents-principal_payment);
      b.loan_months_left:=greatest(0,b.loan_months_left-1);
      applied:=applied+1;
    end loop;
  end loop;
  return applied;
end $$;
revoke all on function public.finance_monthly_tick(uuid,date) from public,anon,authenticated;
grant execute on function public.finance_monthly_tick(uuid,date) to service_role;
