-- Rental property operations: ownership, rent, occupancy, capex, repeat safety.
do $$
declare uid uuid:='11111111-1111-1111-1111-111111111111';
 other_id uuid:='22222222-2222-2222-2222-222222222222';
 request uuid; cash_before bigint; revenue_before bigint; cost_before bigint;
 result jsonb;
begin
 if has_table_privilege('authenticated','public.finance_rental_properties','SELECT')
 then raise exception 'rental portfolio must remain service-only'; end if;
 if has_function_privilege('authenticated','public.finance_rental_manage(uuid,uuid,text,text,jsonb)','EXECUTE')
 then raise exception 'rental write RPC must remain service-only'; end if;
 if exists(select 1 from finance_assets where user_id=uid and asset_key='property:downtown-loft' and owned)
 then raise exception 'unexpected preowned loft'; end if;
 result:=finance_action(uid,gen_random_uuid(),'purchase','property:downtown-loft',false);
 if not exists(select 1 from finance_assets where user_id=uid and asset_key='property:downtown-loft' and owned)
 then raise exception 'purchase missing'; end if;
 revenue_before:=(select monthly_profit_cents from finance_assets where user_id=uid and asset_key='property:downtown-loft');
 if revenue_before<=0 then raise exception 'existing property revenue absent'; end if;
 result:=finance_rental_snapshot(uid);
 if not exists(select 1 from jsonb_array_elements(result) r where r->>'assetKey'='property:downtown-loft' and (r->>'configured')::boolean=false)
 then raise exception 'owned property not shown unconfigured'; end if;
 begin
  perform finance_rental_manage(other_id,gen_random_uuid(),'property:downtown-loft','configure',
    '{"unitCount":4,"occupiedUnits":3,"monthlyRentCents":140000,"monthlyOperatingCostCents":70000}'::jsonb);
  raise exception 'cross-user property edit succeeded';
 exception when raise_exception then
  if SQLERRM<>'Owned residential property required' then raise; end if;
 end;
 begin
  perform finance_rental_manage(uid,gen_random_uuid(),'property:downtown-loft','configure',
    '{"unitCount":2,"occupiedUnits":3,"monthlyRentCents":140000,"monthlyOperatingCostCents":70000}'::jsonb);
  raise exception 'invalid occupancy was accepted';
 exception when raise_exception then
  if SQLERRM<>'Invalid rental configuration' then raise; end if;
 end;
 request:=gen_random_uuid();
 result:=finance_rental_manage(uid,request,'property:downtown-loft','configure',
   '{"unitCount":4,"occupiedUnits":3,"monthlyRentCents":140000,"monthlyOperatingCostCents":70000}'::jsonb);
 if (select monthly_profit_cents from finance_assets where user_id=uid and asset_key='property:downtown-loft')<>420000
   or (select monthly_cost_cents from finance_assets where user_id=uid and asset_key='property:downtown-loft')<>70000
 then raise exception 'rent and operating costs did not update asset settlement'; end if;
 result:=finance_rental_manage(uid,request,'property:downtown-loft','configure',
   '{"unitCount":4,"occupiedUnits":1,"monthlyRentCents":100,"monthlyOperatingCostCents":0}'::jsonb);
 if (select monthly_profit_cents from finance_assets where user_id=uid and asset_key='property:downtown-loft')<>420000
 then raise exception 'repeated request overwrote finances'; end if;
 request:=gen_random_uuid();
 cash_before:=(select cash_cents from finance_accounts where user_id=uid);
 cost_before:=(select monthly_cost_cents from finance_assets where user_id=uid and asset_key='property:downtown-loft');
 result:=finance_rental_manage(uid,request,'property:downtown-loft','renovate','{}'::jsonb);
 if (select cash_cents from finance_accounts where user_id=uid)>=cash_before
 then raise exception 'renovation not charged'; end if;
 if (select monthly_cost_cents from finance_assets where user_id=uid and asset_key='property:downtown-loft')>=cost_before
 then raise exception 'renovation did not decrease operating costs'; end if;
 if (select renovation_level from finance_rental_properties where user_id=uid and asset_key='property:downtown-loft')<>1
 then raise exception 'renovation level missing'; end if;
 cash_before:=(select cash_cents from finance_accounts where user_id=uid);
 result:=finance_rental_manage(uid,request,'property:downtown-loft','renovate','{}'::jsonb);
 if (select cash_cents from finance_accounts where user_id=uid)<>cash_before
 then raise exception 'duplicate renovation charged twice'; end if;
 if exists(select 1 from finance_rental_properties where user_id=other_id)
 then raise exception 'cross-user rental data leaked'; end if;
end $$;
