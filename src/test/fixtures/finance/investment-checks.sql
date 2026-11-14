-- Fictional fund buys, sells and accelerated revaluations; run after 0082.
do $$
declare uid uuid:='11111111-1111-1111-1111-111111111111'; 
 other_id uuid:='22222222-2222-2222-2222-222222222222';
 before_cash bigint;after_cash bigint;before_invest bigint; after_invest bigint;
 r jsonb; id uuid; cycles integer;
begin
 if has_table_privilege('authenticated','public.finance_funds','SELECT')
  then raise exception 'fund balances publicly visible'; end if;
 if has_function_privilege('authenticated','public.finance_trade(uuid,uuid,text,text,bigint)','EXECUTE')
  then raise exception 'investment trade callable without service role'; end if;
 r:=finance_funds_snapshot(uid);
 if jsonb_array_length(r)<>3 then raise exception 'expected three virtual funds'; end if;
 if (select balance_cents from finance_funds where user_id=uid and fund_key='broad_market')<>300000000000
  then raise exception 'existing private investments were not seeded'; end if;
 before_cash:=(select cash_cents from finance_accounts where user_id=uid);
 before_invest:=(select investments_cents from finance_accounts where user_id=uid);
 id:=gen_random_uuid();
 r:=finance_trade(uid,id,'income','buy',100000000);
 after_cash:=(select cash_cents from finance_accounts where user_id=uid);
 after_invest:=(select investments_cents from finance_accounts where user_id=uid);
 if after_cash<>before_cash-100000000 or after_invest<>before_invest+100000000
  then raise exception 'investment purchase not balanced'; end if;
 r:=finance_trade(uid,id,'income','buy',100000000);
 if (select cash_cents from finance_accounts where user_id=uid)<>after_cash
  then raise exception 'duplicate investment purchase'; end if;
 r:=finance_trade(uid,gen_random_uuid(),'income','sell',50000000);
 if (select investments_cents from finance_accounts where user_id=uid)<>after_invest-50000000
  then raise exception 'investment sale not balanced'; end if;
 if (select cash_cents from finance_accounts where user_id=uid)<>after_cash+50000000
  then raise exception 'investment sale did not return cash'; end if;
 cycles:=finance_funds_tick(uid,(current_date+interval '8 days')::date);
 if cycles<1 then raise exception 'accelerated fund revaluation missing'; end if;
 if finance_funds_tick(uid,(current_date+interval '8 days')::date)<>0
  then raise exception 'duplicate investment revaluation'; end if;
 if (select investments_cents from finance_accounts where user_id=uid)<>
    (select sum(balance_cents) from finance_funds where user_id=uid)
  then raise exception 'portfolio totals do not reconcile'; end if;
 if exists(select 1 from finance_funds where user_id=other_id)
  then raise exception 'other player investment seeded without access'; end if;
end $$;
