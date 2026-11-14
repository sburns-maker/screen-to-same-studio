-- Virtual investment accounts. No real securities, market data, or brokerage integration.
create table if not exists public.finance_funds (
 user_id uuid not null references auth.users(id) on delete cascade,
 fund_key text not null check(fund_key in ('broad_market','income','growth')),
 label text not null,
 balance_cents bigint not null default 0 check(balance_cents>=0),
 primary key(user_id,fund_key)
);
create table if not exists public.finance_fund_cycles (
 user_id uuid not null references auth.users(id) on delete cascade,
 fund_key text not null,
 cycle_month date not null,
 growth_bps integer not null,
 before_cents bigint not null,
 after_cents bigint not null,
 primary key(user_id,fund_key,cycle_month),
 foreign key(user_id,fund_key) references finance_funds(user_id,fund_key)
);
alter table public.finance_funds enable row level security;
alter table public.finance_fund_cycles enable row level security;
revoke all on public.finance_funds,public.finance_fund_cycles from anon,authenticated;
grant select,insert,update,delete on public.finance_funds,public.finance_fund_cycles to service_role;

create or replace function public.finance_funds_initialize(p_user uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare total bigint;
begin
 perform finance_initialize(p_user);
 -- Lock prevents concurrent first reads from seeding the same balance twice.
 perform 1 from finance_accounts where user_id=p_user for update;
 if not exists(select 1 from finance_funds where user_id=p_user) then
  select investments_cents into total from finance_accounts where user_id=p_user;
  insert into finance_funds(user_id,fund_key,label,balance_cents)
  values (p_user,'broad_market','Broad Market Fund',total),
   (p_user,'income','Income Fund',0),
   (p_user,'growth','Growth Fund',0);
 end if;
end $$;
revoke all on function public.finance_funds_initialize(uuid) from public,anon,authenticated;
grant execute on function public.finance_funds_initialize(uuid) to service_role;

create or replace function public.finance_funds_snapshot(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
begin
 perform finance_funds_initialize(p_user);
 return coalesce((select jsonb_agg(jsonb_build_object('key',fund_key,'label',label,'balanceCents',balance_cents) order by fund_key)
  from finance_funds where user_id=p_user),'[]'::jsonb);
end $$;
revoke all on function public.finance_funds_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.finance_funds_snapshot(uuid) to service_role;

create or replace function public.finance_trade(
 p_user uuid,p_request uuid,p_fund text,p_side text,p_amount bigint
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype; f finance_funds%rowtype; note_text text;
begin
 if p_amount<=0 then raise exception 'Trade amount must be positive'; end if;
 if p_side not in ('buy','sell') then raise exception 'Invalid trade side'; end if;
 perform finance_funds_initialize(p_user);
 -- Settle completed financial months before allocating new cash; no backdated returns.
 perform finance_funds_tick(p_user,(now() at time zone 'America/New_York')::date);
 select * into a from finance_accounts where user_id=p_user for update;
 if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request)
  then return finance_funds_snapshot(p_user); end if;
 select * into f from finance_funds where user_id=p_user and fund_key=p_fund for update;
 if not found then raise exception 'Unknown investment fund'; end if;
 if p_side='buy' then
  if a.cash_cents<p_amount then raise exception 'Insufficient cash to invest'; end if;
  update finance_accounts set cash_cents=cash_cents-p_amount,investments_cents=investments_cents+p_amount
   where user_id=p_user returning * into a;
  update finance_funds set balance_cents=balance_cents+p_amount where user_id=p_user and fund_key=p_fund;
 else
  if f.balance_cents<p_amount then raise exception 'Insufficient investment balance'; end if;
  update finance_accounts set cash_cents=cash_cents+p_amount,investments_cents=investments_cents-p_amount
   where user_id=p_user returning * into a;
  update finance_funds set balance_cents=balance_cents-p_amount where user_id=p_user and fund_key=p_fund;
 end if;
 insert into finance_ledger(user_id,request_id,event_type,amount_cents,cash_after_cents,note)
  values(p_user,p_request,'investment_'||p_side,
   case when p_side='buy' then -p_amount else p_amount end,
   a.cash_cents,'Virtual '||p_side||' in '||f.label);
 return finance_funds_snapshot(p_user);
end $$;
revoke all on function public.finance_trade(uuid,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.finance_trade(uuid,uuid,text,text,bigint) to service_role;

create or replace function public.finance_funds_tick(p_user uuid,p_real_day date)
returns integer language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype; f finance_funds%rowtype; m date; first_day date; virtual_day date;
 rate_bps integer; grown bigint; applied integer:=0;
begin
 if not exists(select 1 from finance_accounts where user_id=p_user) then return 0; end if;
 perform finance_funds_initialize(p_user);
 select * into a from finance_accounts where user_id=p_user for update;
 first_day:=(a.created_at at time zone 'America/New_York')::date;
 virtual_day:=finance_virtual_date(first_day,p_real_day);
 for f in select * from finance_funds where user_id=p_user for update loop
  for m in select gs::date from generate_series(
    greatest(date_trunc('month',first_day)::date,(date_trunc('month',virtual_day)-interval '12 months')::date),
    (date_trunc('month',virtual_day)-interval '1 month')::date,interval '1 month') gs loop
   -- Deterministic virtual-month returns: low-risk -1..+2%, income -2..+3%,
   -- and growth -4..+6%; no claim of real investment performance.
   rate_bps:=case f.fund_key
    when 'income' then -200 + mod(hashtext(f.fund_key||m::text)::bigint+2147483648,501)::int
    when 'growth' then -400 + mod(hashtext(f.fund_key||m::text)::bigint+2147483648,1001)::int
    else -100 + mod(hashtext(f.fund_key||m::text)::bigint+2147483648,301)::int end;
   grown:=greatest(0,f.balance_cents+round(f.balance_cents::numeric*rate_bps/10000)::bigint);
   insert into finance_fund_cycles(user_id,fund_key,cycle_month,growth_bps,before_cents,after_cents)
    values(p_user,f.fund_key,m,rate_bps,f.balance_cents,grown) on conflict do nothing;
   if not found then continue; end if;
   update finance_funds set balance_cents=grown where user_id=p_user and fund_key=f.fund_key;
   update finance_accounts set investments_cents=investments_cents+grown-f.balance_cents
    where user_id=p_user returning * into a;
   insert into finance_ledger(user_id,request_id,event_type,amount_cents,cash_after_cents,note)
    values(p_user,gen_random_uuid(),'investment_revaluation',0,a.cash_cents,
      f.label||' virtual return '||rate_bps::text||' bps for '||to_char(m,'YYYY-MM'));
   f.balance_cents:=grown;applied:=applied+1;
  end loop;
 end loop;
 return applied;
end $$;
revoke all on function public.finance_funds_tick(uuid,date) from public,anon,authenticated;
grant execute on function public.finance_funds_tick(uuid,date) to service_role;
