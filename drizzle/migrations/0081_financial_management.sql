-- Business operations extension for the fictional financial world.
-- Execute after 0080. Service-only commands and player/character isolation.
create table if not exists public.finance_expenses (
 user_id uuid not null references auth.users(id) on delete cascade,
 expense_key uuid not null default gen_random_uuid(),
 label text not null check(length(label) between 2 and 80),
 monthly_cents bigint not null check(monthly_cents between 1 and 100000000000),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 primary key(user_id,expense_key)
);
create table if not exists public.finance_expense_cycles (
 user_id uuid not null references auth.users(id) on delete cascade,
 expense_key uuid not null,
 cycle_month date not null,
 primary key(user_id,expense_key,cycle_month),
 foreign key(user_id,expense_key) references finance_expenses(user_id,expense_key)
);
create table if not exists public.finance_improvements (
 user_id uuid not null references auth.users(id) on delete cascade,
 asset_key text not null,
 level integer not null default 0 check(level between 0 and 5),
 primary key(user_id,asset_key),
 foreign key(user_id,asset_key) references finance_assets(user_id,asset_key) on delete cascade
);
create table if not exists public.finance_disclosures (
 user_id uuid not null references auth.users(id) on delete cascade,
 character_key text not null,
 subject_key text not null,
 disclosed_at timestamptz not null default now(),
 primary key(user_id,character_key,subject_key)
);
alter table public.finance_expenses enable row level security;
alter table public.finance_expense_cycles enable row level security;
alter table public.finance_improvements enable row level security;
alter table public.finance_disclosures enable row level security;
revoke all on public.finance_expenses,public.finance_expense_cycles,public.finance_improvements,public.finance_disclosures from anon,authenticated;
grant select,insert,update,delete on public.finance_expenses,public.finance_expense_cycles,public.finance_improvements,public.finance_disclosures to service_role;

create or replace function public.finance_management_snapshot(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
begin
 perform finance_initialize(p_user);
 return jsonb_build_object(
  'expenses',coalesce((select jsonb_agg(jsonb_build_object('key',expense_key,'label',label,'monthlyCents',monthly_cents,'active',active) order by label) from finance_expenses where user_id=p_user),'[]'::jsonb),
  'improvements',coalesce((select jsonb_agg(jsonb_build_object('assetKey',asset_key,'level',level)) from finance_improvements where user_id=p_user),'[]'::jsonb),
  'disclosures',coalesce((select jsonb_agg(jsonb_build_object('characterKey',character_key,'subjectKey',subject_key,'disclosedAt',disclosed_at)) from finance_disclosures where user_id=p_user),'[]'::jsonb)
 );
end $$;
revoke all on function public.finance_management_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.finance_management_snapshot(uuid) to service_role;

create or replace function public.finance_manage(
 p_user uuid,p_request uuid,p_command text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype;
 b finance_assets%rowtype;
 v_key text;
 v_worker text;
 v_label text;
 v_amount bigint;
 v_level integer;
 v_cost bigint;
 v_character text;
 v_subject text;
 v_uuid uuid;
begin
 perform finance_initialize(p_user);
 select * into a from finance_accounts where user_id=p_user for update;
 if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request) then
  return finance_management_snapshot(p_user);
 end if;
 if p_command='expense_add' then
  v_label:=btrim(p_payload->>'label');
  if v_label is null or length(v_label) not between 2 and 80 or v_label ~ '[[:cntrl:]]'
   then raise exception 'Invalid expense label'; end if;
  v_amount:=(p_payload->>'monthlyCents')::bigint;
  if v_amount not between 1 and 100000000000 then raise exception 'Invalid expense amount'; end if;
  insert into finance_expenses(user_id,label,monthly_cents) values(p_user,v_label,v_amount);
 elsif p_command='expense_remove' then
  v_uuid:=(p_payload->>'expenseKey')::uuid;
  update finance_expenses set active=false where user_id=p_user and expense_key=v_uuid and active=true;
  if not found then raise exception 'Unknown active expense'; end if;
 elsif p_command in ('hire','fire','upgrade','reveal') then
  v_key:=p_payload->>'assetKey';
  select * into b from finance_assets where user_id=p_user and asset_key=v_key for update;
  if not found or not b.owned then raise exception 'Owned asset required'; end if;
  if p_command='hire' then
   v_label:=btrim(p_payload->>'name');
   if v_label is null or length(v_label) not between 2 and 60 or v_label ~ '[[:cntrl:]]'
    then raise exception 'Invalid employee name'; end if;
   v_amount:=(p_payload->>'monthlyCents')::bigint;
   if v_amount not between 10000 and 500000000 then raise exception 'Salary out of range'; end if;
   v_worker:='hire:'||gen_random_uuid()::text;
   insert into finance_workers(user_id,asset_key,worker_key,display_name,role,salary_cents,character_key)
    values(p_user,v_key,v_worker,v_label,'Hired staff',v_amount,null);
   update finance_assets set staff_count=staff_count+1 where user_id=p_user and asset_key=v_key;
  elsif p_command='fire' then
   v_worker:=p_payload->>'workerKey';
   -- Only newly hired generic employees can be released. Named canon characters
   -- have independent lives and cannot be rewritten by a finance button.
   if v_worker is null or left(v_worker,5)<>'hire:' then raise exception 'Only hired staff can be released'; end if;
   update finance_workers set active=false where user_id=p_user and asset_key=v_key and worker_key=v_worker and active=true;
   if not found then raise exception 'Unknown hired worker'; end if;
   update finance_assets set staff_count=greatest(0,staff_count-1) where user_id=p_user and asset_key=v_key;
  elsif p_command='upgrade' then
   insert into finance_improvements(user_id,asset_key,level) values(p_user,v_key,0) on conflict do nothing;
   select level into v_level from finance_improvements where user_id=p_user and asset_key=v_key for update;
   if v_level>=5 then raise exception 'Maximum improvement level reached'; end if;
   v_cost:=greatest(50000, (b.price_cents/100)*(v_level+1));
   if a.cash_cents<v_cost then raise exception 'Insufficient player funds for upgrade'; end if;
   update finance_accounts set cash_cents=cash_cents-v_cost where user_id=p_user returning * into a;
   update finance_improvements set level=level+1 where user_id=p_user and asset_key=v_key;
   -- 5% of original turnover per upgrade. The baseline also increases so the
   -- capped quarterly-growth calculation retains the earned improvement.
   update finance_assets set monthly_profit_cents=monthly_profit_cents+(baseline_revenue_cents/20),
    baseline_revenue_cents=baseline_revenue_cents+(baseline_revenue_cents/20)
   where user_id=p_user and asset_key=v_key;
  else
   v_character:=p_payload->>'characterKey';
   v_subject:=v_key;
   if v_character is null or v_character not in
    ('tess','maya','claire','jordan','ben','sienna','kendra','riley','carly','brooke','jade','nina')
    then raise exception 'Unknown character'; end if;
   insert into finance_disclosures(user_id,character_key,subject_key)
    values(p_user,v_character,v_subject) on conflict do nothing;
  end if;
 elsif p_command='reveal_identity' then
   v_character:=p_payload->>'characterKey';
   if v_character is null or v_character not in
    ('tess','maya','claire','jordan','ben','sienna','kendra','riley','carly','brooke','jade','nina')
    then raise exception 'Unknown character'; end if;
   insert into finance_disclosures(user_id,character_key,subject_key)
    values(p_user,v_character,'identity') on conflict do nothing;
 else
  raise exception 'Unknown finance command';
 end if;
 insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
 values(p_user,p_request,'management_'||p_command,case when p_command in ('hire','fire','upgrade','reveal') then v_key else null end,
   case when p_command='upgrade' then -v_cost else 0 end,a.cash_cents,'Fictional management: '||p_command);
 return finance_management_snapshot(p_user);
end $$;
revoke all on function public.finance_manage(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_manage(uuid,uuid,text,jsonb) to service_role;

create or replace function public.finance_personal_expense_tick(p_user uuid,p_real_day date)
returns integer language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype; e finance_expenses%rowtype; m date; first_day date; virtual_day date; applied integer:=0;
begin
 if not exists(select 1 from finance_accounts where user_id=p_user) then return 0; end if;
 select * into a from finance_accounts where user_id=p_user for update;
 first_day:=(a.created_at at time zone 'America/New_York')::date;
 virtual_day:=finance_virtual_date(first_day,p_real_day);
 for e in select * from finance_expenses where user_id=p_user and active for update loop
  for m in select gs::date from generate_series(
    greatest(date_trunc('month',first_day)::date,
      (date_trunc('month',virtual_day)-interval '12 months')::date),
    (date_trunc('month',virtual_day)-interval '1 month')::date,interval '1 month') gs loop
   insert into finance_expense_cycles(user_id,expense_key,cycle_month)
    values(p_user,e.expense_key,m) on conflict do nothing;
   if not found then continue; end if;
   if a.cash_cents<e.monthly_cents then raise exception 'Insufficient balance for personal expenses'; end if;
   update finance_accounts set cash_cents=cash_cents-e.monthly_cents
    where user_id=p_user returning * into a;
   insert into finance_ledger(user_id,request_id,event_type,amount_cents,cash_after_cents,note)
    values(p_user,gen_random_uuid(),'personal_expense',-e.monthly_cents,a.cash_cents,
      'Fictional '||e.label||' '||to_char(m,'YYYY-MM'));
   applied:=applied+1;
  end loop;
 end loop;
 return applied;
end $$;
revoke all on function public.finance_personal_expense_tick(uuid,date) from public,anon,authenticated;
grant execute on function public.finance_personal_expense_tick(uuid,date) to service_role;
