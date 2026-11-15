-- Owner-managed fictional rental-property operations; safe additive migration.
-- Apply after 0089. Existing financial asset rows, purchases and past settlements remain intact.
create table if not exists public.finance_rental_properties (
 user_id uuid not null,
 asset_key text not null,
 unit_count integer not null check(unit_count between 1 and 10000),
 occupied_units integer not null check(occupied_units between 0 and unit_count),
 monthly_rent_cents bigint not null check(monthly_rent_cents between 0 and 1000000000),
 monthly_operating_cost_cents bigint not null check(monthly_operating_cost_cents between 0 and 100000000000),
 renovation_level integer not null default 0 check(renovation_level between 0 and 5),
 updated_at timestamptz not null default now(),
 primary key (user_id,asset_key),
 foreign key (user_id,asset_key) references public.finance_assets(user_id,asset_key) on delete cascade
);
alter table public.finance_rental_properties enable row level security;
revoke all on public.finance_rental_properties from public,anon,authenticated;
grant select,insert,update,delete on public.finance_rental_properties to service_role;

create or replace function public.finance_rental_snapshot(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
begin
 perform finance_initialize(p_user);
 return coalesce((select jsonb_agg(jsonb_build_object(
   'assetKey',a.asset_key,'label',a.label,'configured',r.asset_key is not null,
   'unitCount',r.unit_count,'occupiedUnits',r.occupied_units,
   'monthlyRentCents',r.monthly_rent_cents,
   'monthlyOperatingCostCents',coalesce(r.monthly_operating_cost_cents,a.monthly_cost_cents),
   'renovationLevel',coalesce(r.renovation_level,0),
   'monthlyRevenueCents',a.monthly_profit_cents,
   'monthlyCostCents',a.monthly_cost_cents,
   'loanCents',a.loan_cents,'reservesCents',a.company_reserves_cents
 ) order by a.label)
 from finance_assets a left join finance_rental_properties r
  on r.user_id=a.user_id and r.asset_key=a.asset_key
 where a.user_id=p_user and a.owned and a.category='residential'),'[]'::jsonb);
end $$;
revoke all on function public.finance_rental_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.finance_rental_snapshot(uuid) to service_role;

create or replace function public.finance_rental_manage(
 p_user uuid,p_request uuid,p_asset text,p_command text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype; b finance_assets%rowtype; r finance_rental_properties%rowtype;
 v_units integer; v_occupied integer; v_rent bigint; v_cost bigint; v_amount bigint:=0;
begin
 if p_request is null then raise exception 'Request ID required'; end if;
 perform finance_initialize(p_user);
 -- Settle completed months before changing operating assumptions so past cycles
 -- cannot be recalculated at a new rent or vacancy rate.
 perform finance_monthly_tick(p_user,(now() at time zone 'America/New_York')::date);
 select * into a from finance_accounts where user_id=p_user for update;
 if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request) then
   return finance_rental_snapshot(p_user);
 end if;
 select * into b from finance_assets
  where user_id=p_user and asset_key=p_asset for update;
 if not found or not b.owned or b.category<>'residential'
 then raise exception 'Owned residential property required'; end if;
 select * into r from finance_rental_properties
  where user_id=p_user and asset_key=p_asset for update;
 if p_command='configure' then
   if p_payload is null or p_payload->>'unitCount' is null
     or p_payload->>'occupiedUnits' is null or p_payload->>'monthlyRentCents' is null
     or p_payload->>'monthlyOperatingCostCents' is null
   then raise exception 'Complete all property fields'; end if;
   v_units:=(p_payload->>'unitCount')::integer;
   v_occupied:=(p_payload->>'occupiedUnits')::integer;
   v_rent:=(p_payload->>'monthlyRentCents')::bigint;
   v_cost:=(p_payload->>'monthlyOperatingCostCents')::bigint;
   if v_units not between 1 and 10000 or v_occupied not between 0 and v_units
      or v_rent not between 0 and 1000000000 or v_cost not between 0 and 100000000000
      or v_rent*v_occupied>100000000000
   then raise exception 'Invalid rental configuration'; end if;
   insert into finance_rental_properties(user_id,asset_key,unit_count,occupied_units,
      monthly_rent_cents,monthly_operating_cost_cents)
   values(p_user,p_asset,v_units,v_occupied,v_rent,v_cost)
   on conflict(user_id,asset_key) do update set unit_count=excluded.unit_count,
     occupied_units=excluded.occupied_units,monthly_rent_cents=excluded.monthly_rent_cents,
     monthly_operating_cost_cents=excluded.monthly_operating_cost_cents,updated_at=now();
   update finance_assets set monthly_profit_cents=v_rent*v_occupied,
     baseline_revenue_cents=v_rent*v_occupied,
     monthly_cost_cents=v_cost
   where user_id=p_user and asset_key=p_asset;
 elsif p_command='renovate' then
   if r.asset_key is null then raise exception 'Configure property first'; end if;
   if r.renovation_level>=5 then raise exception 'Maximum renovation level reached'; end if;
   -- One-time capex is paid from player cash, not silently treated as monthly cost.
   v_amount:=greatest(50000, (b.price_cents/200)*(r.renovation_level+1));
   if a.cash_cents<v_amount then raise exception 'Insufficient funds for renovation'; end if;
   update finance_accounts set cash_cents=cash_cents-v_amount
     where user_id=p_user returning * into a;
   -- Quality improvements decrease recurring maintenance expenses by 5% per level.
   v_cost:=greatest(0,r.monthly_operating_cost_cents
     -floor(r.monthly_operating_cost_cents*0.05)::bigint);
   update finance_rental_properties set renovation_level=renovation_level+1,
      monthly_operating_cost_cents=v_cost,updated_at=now()
     where user_id=p_user and asset_key=p_asset;
   update finance_assets set monthly_cost_cents=v_cost
     where user_id=p_user and asset_key=p_asset;
 else
   raise exception 'Unknown rental action';
 end if;
 insert into finance_ledger(user_id,request_id,event_type,asset_key,
    amount_cents,cash_after_cents,note)
 values(p_user,p_request,'rental_'||p_command,p_asset,-v_amount,a.cash_cents,
   case when p_command='configure' then 'Rental units, rent, occupancy and costs updated'
   else 'Property renovation completed' end);
 return finance_rental_snapshot(p_user);
end $$;
revoke all on function public.finance_rental_manage(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_rental_manage(uuid,uuid,text,text,jsonb) to service_role;
