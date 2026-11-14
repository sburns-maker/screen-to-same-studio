-- Assertion-oriented integration tests, run against a disposable PostgreSQL database.
do $$
declare
  uid uuid := '11111111-1111-1111-1111-111111111111';
  other_id uuid := '22222222-2222-2222-2222-222222222222';
  response jsonb;
  original_cash bigint;
  balance_after bigint;
  remaining bigint;
  reserves bigint;
  salary bigint;
  months integer;
  id uuid;
begin
  if has_table_privilege('anon','public.finance_accounts','SELECT') then
    raise exception 'anon role should not read private finance_accounts';
  end if;
  if has_function_privilege('authenticated','public.finance_action(uuid,uuid,text,text,boolean)','EXECUTE') then
    raise exception 'authenticated role should not call finance_action directly';
  end if;
  if finance_virtual_date(date '2026-11-14',date '2026-11-15')<>date '2026-11-21' then raise exception '1 real day must equal 7 virtual days'; end if;
  if finance_virtual_date(date '2026-11-14',date '2026-11-14')<>date '2026-11-14' then raise exception 'finance must start at player account date'; end if;
  response:=finance_snapshot(uid);
  if (response->>'cashCents')::bigint<>500000000000 then raise exception 'incorrect hidden starting cash'; end if;
  if (response->>'investmentsCents')::bigint<>300000000000 then raise exception 'incorrect investments'; end if;
  if response->>'visibility'<>'private' then raise exception 'wealth should start private'; end if;
  if response->>'companyName'<>'Northline Group' or response->>'jobTitle'<>'Director of Special Projects' then raise exception 'wrong default professional identity'; end if;
  response:=finance_set_identity(uid,gen_random_uuid(),'Northline Group','Regional Projects Coordinator');
  if response->>'jobTitle'<>'Regional Projects Coordinator' then raise exception 'professional identity not persisted'; end if;
  if response->>'financePace'<>'7 virtual days per real day' then raise exception 'finance clock mode mismatch'; end if;
  if jsonb_array_length(response->'assets')<>28 then raise exception 'expected 28 purchasable game assets, got %',jsonb_array_length(response->'assets'); end if;
  if (select price_cents from finance_assets where user_id=uid and asset_key='work:upmc-altoona')<>200000000000 then
    raise exception 'UPMC fictional valuation should be $2bn';
  end if;
  original_cash:=(response->>'cashCents')::bigint;
  id:=gen_random_uuid();
  response:=finance_action(uid,id,'purchase','work:after-dark',false);
  balance_after:=(response->>'cashCents')::bigint;
  if balance_after<>original_cash-42500000 then raise exception 'purchase debit incorrect'; end if;
  response:=finance_action(uid,id,'purchase','work:after-dark',false);
  if (response->>'cashCents')::bigint<>balance_after then raise exception 'duplicate purchase changed balance'; end if;
  id:=gen_random_uuid();
  response:=finance_set_salary(uid,id,'work:after-dark','carly',650000);
  salary:=(select salary_cents from finance_workers where user_id=uid and asset_key='work:after-dark' and worker_key='carly');
  if salary<>650000 then raise exception 'salary adjustment not applied'; end if;
  months:=finance_monthly_tick(uid,(current_date+interval '21 days')::date);
  if months<1 then raise exception 'business monthly settlement did not run'; end if;
  if finance_monthly_tick(uid,(current_date+interval '21 days')::date)<>0 then raise exception 'duplicate world tick paid same virtual month twice'; end if;
  if (select monthly_profit_cents from finance_assets where user_id=uid and asset_key='work:after-dark')<=
     (select baseline_revenue_cents from finance_assets where user_id=uid and asset_key='work:after-dark') then
    raise exception 'quarterly revenue did not increase';
  end if;
  reserves:=(select company_reserves_cents from finance_assets where user_id=uid and asset_key='work:after-dark');
  if reserves<=0 then raise exception 'no retained earnings for business'; end if;
  balance_after:=(select cash_cents from finance_accounts where user_id=uid);
  id:=gen_random_uuid();
  response:=finance_owner_draw(uid,id,'work:after-dark',10000);
  if (response->>'cashCents')::bigint<>balance_after+10000 then raise exception 'owner draw did not credit player cash'; end if;
  if (select company_reserves_cents from finance_assets where user_id=uid and asset_key='work:after-dark')<>reserves-10000 then
    raise exception 'owner draw did not debit company reserves';
  end if;
  response:=finance_owner_draw(uid,id,'work:after-dark',10000);
  if (response->>'cashCents')::bigint<>balance_after+10000 then raise exception 'duplicate owner draw changed balance'; end if;
  response:=finance_set_draw_rate(uid,gen_random_uuid(),'work:after-dark',25);
  if (select owner_draw_pct from finance_assets where user_id=uid and asset_key='work:after-dark')<>25 then raise exception 'draw rate did not apply'; end if;
  remaining:=(select company_reserves_cents from finance_assets where user_id=uid and asset_key='work:after-dark');
  balance_after:=(select cash_cents from finance_accounts where user_id=uid);
  response:=finance_action(uid,gen_random_uuid(),'sell','work:after-dark',false);
  if (response->>'cashCents')::bigint<>balance_after+42500000+remaining then raise exception 'sale did not return book value plus reserves'; end if;
  if (select owned or company_reserves_cents<>0 from finance_assets where user_id=uid and asset_key='work:after-dark') then raise exception 'sale retained company reserves or ownership'; end if;
  if exists(select 1 from finance_accounts where user_id=other_id) then raise exception 'second account should remain uninitialized'; end if;
end $$;
