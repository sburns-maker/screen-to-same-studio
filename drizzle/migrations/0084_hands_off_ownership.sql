-- 0084: fictional owner/manager separation, per player and per acquired company.
-- This is an in-game policy record, not a signed employment agreement.
create table if not exists public.finance_governance (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_key text not null,
  hands_off boolean not null default false,
  operating_manager text not null default 'Existing practice management',
  reports_to text not null default 'Existing supervisory chain',
  independent_hr text not null default 'Independent HR / designated representative',
  conflict_recusal boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id,asset_key),
  foreign key (user_id,asset_key) references public.finance_assets(user_id,asset_key) on delete cascade,
  check (length(operating_manager) between 3 and 120),
  check (length(reports_to) between 3 and 120),
  check (length(independent_hr) between 3 and 120)
);
alter table public.finance_governance enable row level security;
revoke all on public.finance_governance from anon,authenticated;
grant select,insert,update,delete on public.finance_governance to service_role;

create or replace function public.finance_governance_snapshot(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'assetKey',g.asset_key, 'handsOff',g.hands_off,
      'operatingManager',g.operating_manager,
      'reportsTo',g.reports_to,'independentHr',g.independent_hr,
      'conflictRecusal',g.conflict_recusal,'updatedAt',g.updated_at
    ) order by g.asset_key)
    from finance_governance g join finance_assets a
      on a.user_id=g.user_id and a.asset_key=g.asset_key
    where g.user_id=p_user and a.owned=true
  ),'[]'::jsonb);
end $$;
revoke all on function public.finance_governance_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.finance_governance_snapshot(uuid) to service_role;

create or replace function public.finance_governance_save(
  p_user uuid,p_request uuid,p_asset text,p_hands_off boolean,
  p_manager text,p_reports_to text,p_independent_hr text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a finance_accounts%rowtype; b finance_assets%rowtype;
begin
  if p_hands_off is null or p_manager is null or p_reports_to is null or p_independent_hr is null
    or length(btrim(p_manager)) not between 3 and 120
    or length(btrim(p_reports_to)) not between 3 and 120
    or length(btrim(p_independent_hr)) not between 3 and 120
    or p_manager ~ '[[:cntrl:]]' or p_reports_to ~ '[[:cntrl:]]'
    or p_independent_hr ~ '[[:cntrl:]]'
  then raise exception 'Invalid governance policy'; end if;
  perform finance_initialize(p_user);
  select * into a from finance_accounts where user_id=p_user for update;
  if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request)
  then return finance_governance_snapshot(p_user); end if;
  select * into b from finance_assets where user_id=p_user and asset_key=p_asset for update;
  if not found or not b.owned or b.category<>'business'
  then raise exception 'Owned operating business required'; end if;
  insert into finance_governance(user_id,asset_key,hands_off,operating_manager,reports_to,independent_hr,conflict_recusal)
  values (p_user,p_asset,p_hands_off,btrim(p_manager),btrim(p_reports_to),btrim(p_independent_hr),true)
  on conflict (user_id,asset_key) do update
  set hands_off=excluded.hands_off,operating_manager=excluded.operating_manager,
      reports_to=excluded.reports_to,independent_hr=excluded.independent_hr,
      conflict_recusal=true,updated_at=now();
  insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
  values(p_user,p_request,'governance_policy',p_asset,0,a.cash_cents,'Updated fictional operating governance for '||b.label);
  return finance_governance_snapshot(p_user);
end $$;
revoke all on function public.finance_governance_save(uuid,uuid,text,boolean,text,text,text)
 from public,anon,authenticated;
grant execute on function public.finance_governance_save(uuid,uuid,text,boolean,text,text,text)
 to service_role;

-- A hands-off owner cannot directly change employment status or compensation via existing RPCs.
-- The simulated operations team remains independent. Even service-only finance_manage
-- and finance_set_salary must honor the separation.
create or replace function public.finance_hands_off_staff_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from finance_governance g
    where g.user_id=new.user_id and g.asset_key=new.asset_key and g.hands_off=true)
    and (
      (tg_op='INSERT' and left(new.worker_key,5)='hire:')
      or (tg_op='UPDATE' and (new.salary_cents is distinct from old.salary_cents
                                  or new.active is distinct from old.active))
    )
  then raise exception 'Hands-off ownership: direct staff decisions are delegated'; end if;
  return new;
end $$;
revoke all on function public.finance_hands_off_staff_guard() from public,anon,authenticated;
drop trigger if exists finance_hands_off_staff_guard on public.finance_workers;
create trigger finance_hands_off_staff_guard before insert or update on public.finance_workers
for each row execute function public.finance_hands_off_staff_guard();
