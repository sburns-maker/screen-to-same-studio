-- Integration checks for the extension. Run after 0080 checks on the same test database.
do $$
declare uid uuid:='11111111-1111-1111-1111-111111111111';
 other_id uuid:='22222222-2222-2222-2222-222222222222';
 result jsonb; cash_before bigint; cash_after bigint; value_before bigint;
 id uuid; bill uuid; hired text; count_before integer;
begin
 if has_table_privilege('anon','public.finance_disclosures','SELECT')
  then raise exception 'financial disclosures must be private'; end if;
 if has_function_privilege('authenticated','public.finance_manage(uuid,uuid,text,jsonb)','EXECUTE')
  then raise exception 'direct management RPC must require service role'; end if;
 result:=finance_management_snapshot(uid);
 if result->'expenses'<>'[]'::jsonb then raise exception 'expenses should start empty'; end if;
 result:=finance_manage(uid,gen_random_uuid(),'expense_add','{"label":"Household expenses","monthlyCents":250000}'::jsonb);
 select expense_key into bill from finance_expenses where user_id=uid and active limit 1;
 if bill is null then raise exception 'bill not saved'; end if;
 cash_before:=(select cash_cents from finance_accounts where user_id=uid);
 if finance_personal_expense_tick(uid,(current_date+interval '7 days')::date)<1
  then raise exception 'virtual monthly expenses not paid'; end if;
 cash_after:=(select cash_cents from finance_accounts where user_id=uid);
 if cash_after>=cash_before then raise exception 'personal expenses did not debit balance'; end if;
 if finance_personal_expense_tick(uid,(current_date+interval '7 days')::date)<>0
  then raise exception 'expense duplicated across ticks'; end if;
 result:=finance_manage(uid,gen_random_uuid(),'expense_remove',jsonb_build_object('expenseKey',bill));
 if exists(select 1 from finance_expenses where user_id=uid and expense_key=bill and active)
  then raise exception 'expense not stopped'; end if;

 -- First base migration tests sold After Dark; buy another fictional asset.
 result:=finance_action(uid,gen_random_uuid(),'purchase','work:northlight',false);
 count_before:=(select staff_count from finance_assets where user_id=uid and asset_key='work:northlight');
 id:=gen_random_uuid();
 result:=finance_manage(uid,id,'hire','{"assetKey":"work:northlight","name":"Alex Rivera","monthlyCents":450000}'::jsonb);
 select worker_key into hired from finance_workers where user_id=uid and asset_key='work:northlight' and display_name='Alex Rivera';
 if hired is null or (select staff_count from finance_assets where user_id=uid and asset_key='work:northlight')<>count_before+1
  then raise exception 'employee hire did not change payroll headcount'; end if;
 result:=finance_manage(uid,id,'hire','{"assetKey":"work:northlight","name":"Alex Rivera","monthlyCents":450000}'::jsonb);
 if (select count(*) from finance_workers where user_id=uid and asset_key='work:northlight' and display_name='Alex Rivera')<>1
  then raise exception 'duplicate hire request was not idempotent'; end if;
 result:=finance_manage(uid,gen_random_uuid(),'fire',jsonb_build_object('assetKey','work:northlight','workerKey',hired));
 if (select active from finance_workers where user_id=uid and asset_key='work:northlight' and worker_key=hired)
  then raise exception 'released employee still active'; end if;
 if (select staff_count from finance_assets where user_id=uid and asset_key='work:northlight')<>count_before
  then raise exception 'release did not decrease active headcount'; end if;
 begin
  perform finance_manage(uid,gen_random_uuid(),'fire','{"assetKey":"work:northlight","workerKey":"kendra"}'::jsonb);
  raise exception 'firing a canon character should have failed';
 exception when raise_exception then
  if SQLERRM<>'Only hired staff can be released' then raise; end if;
 end;
 value_before:=(select monthly_profit_cents from finance_assets where user_id=uid and asset_key='work:northlight');
 cash_before:=(select cash_cents from finance_accounts where user_id=uid);
 result:=finance_manage(uid,gen_random_uuid(),'upgrade','{"assetKey":"work:northlight"}'::jsonb);
 if (select monthly_profit_cents from finance_assets where user_id=uid and asset_key='work:northlight')<=value_before
  then raise exception 'upgrade did not increase potential revenue'; end if;
 if (select cash_cents from finance_accounts where user_id=uid)>=cash_before
  then raise exception 'upgrade did not cost player funds'; end if;
 result:=finance_manage(uid,gen_random_uuid(),'reveal','{"assetKey":"work:northlight","characterKey":"kendra"}'::jsonb);
 if not exists(select 1 from finance_disclosures where user_id=uid and character_key='kendra' and subject_key='work:northlight')
  then raise exception 'character knowledge reveal was not saved'; end if;
 if exists(select 1 from finance_disclosures where user_id=uid and character_key='riley')
  then raise exception 'ownership disclosure leaked to another character'; end if;
 result:=finance_manage(uid,gen_random_uuid(),'reveal_identity','{"characterKey":"kendra"}'::jsonb);
 if not exists(select 1 from finance_disclosures where user_id=uid and character_key='kendra' and subject_key='identity')
  then raise exception 'career disclosure not saved'; end if;
 if exists(select 1 from finance_disclosures where user_id=other_id)
  then raise exception 'cross-user financial disclosure'; end if;
end $$;
