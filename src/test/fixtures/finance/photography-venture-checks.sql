-- Fictional studio journey: research -> offer -> counter -> close -> renovate -> operate -> exit.
do $$
declare
 uid uuid:='11111111-1111-1111-1111-111111111111';
 other_id uuid:='22222222-2222-2222-2222-222222222222';
 v_id uuid; asset text; req uuid; before_cash bigint; after_cash bigint;
 snap jsonb; workers_before integer;
begin
 if has_table_privilege('authenticated','public.finance_ventures','SELECT')
  or has_table_privilege('anon','public.finance_venture_events','SELECT')
 then raise exception 'Sensitive studio records exposed'; end if;
 if has_function_privilege('authenticated','public.finance_venture_action(uuid,uuid,uuid,text,jsonb)','EXECUTE')
 then raise exception 'Studio action RPC exposed to clients'; end if;
 perform finance_initialize(uid);
 before_cash:=(select cash_cents from finance_accounts where user_id=uid);
 req:=gen_random_uuid();
 snap:=finance_venture_action(uid,req,null,'start','{"path":"existing","name":"Willow Light Portrait Studio"}');
 select venture_id into v_id from finance_ventures where user_id=uid and stage='research';
 if v_id is null then raise exception 'Venture was not created'; end if;
 perform finance_venture_action(uid,req,null,'start','{"path":"existing","name":"Willow Light Portrait Studio"}');
 if (select count(*) from finance_ventures where user_id=uid)<>1
 then raise exception 'Duplicate studio was created on request replay'; end if;
 begin
  perform finance_venture_action(uid,gen_random_uuid(),v_id,'start','{"path":"build","name":"Second Studio"}');
  raise exception 'Second simultaneous studio venture allowed';
 exception when raise_exception then
  if SQLERRM<>'Active photography venture already exists' then raise; end if;
 end;
 begin
  perform finance_venture_action(uid,gen_random_uuid(),v_id,'offer','{"offerCents":13000000,"financing":"cash"}');
  raise exception 'Offer allowed without due diligence';
 exception when raise_exception then
  if SQLERRM<>'Finish all three due diligence checks before offering' then raise; end if;
 end;
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'inspect','{"check":"books"}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'inspect','{"check":"space"}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'inspect','{"check":"permits"}');
 if (select inspection_flags from finance_ventures where user_id=uid and venture_id=v_id)<>7
 then raise exception 'Did not persist three inspections'; end if;
 begin
  perform finance_venture_action(uid,gen_random_uuid(),v_id,'inspect','{"check":"books"}');
  raise exception 'Duplicate inspection charged again';
 exception when raise_exception then
  if SQLERRM<>'Review already completed' then raise; end if;
 end;
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'offer','{"offerCents":12400000,"financing":"cash"}');
 begin
  perform finance_venture_action(uid,gen_random_uuid(),v_id,'respond','{}');
  raise exception 'Seller replied before virtual due date';
 exception when raise_exception then
  if SQLERRM<>'Seller has not responded yet' then raise; end if;
 end;
 update finance_ventures set offer_due_virtual=current_date-1 where user_id=uid and venture_id=v_id;
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'respond','{}');
 if (select stage from finance_ventures where user_id=uid and venture_id=v_id)<>'offer_accepted'
 then raise exception 'Seller did not counter or accept'; end if;
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'invite_sienna','{}');
 if (select sienna_involvement from finance_ventures where user_id=uid and venture_id=v_id)<>'invited'
 then raise exception 'Sienna discussion not recorded'; end if;
 workers_before:=(select count(*) from finance_workers where user_id=uid and character_key='sienna');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'close','{}');
 select asset_key into asset from finance_ventures where user_id=uid and venture_id=v_id;
 if (select stage from finance_ventures where user_id=uid and venture_id=v_id)<>'buildout'
  or not exists(select 1 from finance_assets where user_id=uid and asset_key=asset and owned)
 then raise exception 'Closing failed to create an owned business'; end if;
 if exists(select 1 from finance_assets where user_id=other_id and asset_key=asset)
 then raise exception 'Studio asset leaked to another player'; end if;
 if (select count(*) from finance_workers where user_id=uid and character_key='sienna')<>workers_before
 then raise exception 'Invitation silently changed Sienna employment'; end if;
 if (select monthly_profit_cents from finance_assets where user_id=uid and asset_key=asset)<>0
 then raise exception 'Closed but unlaunched studio generated revenue'; end if;
 begin
  perform finance_venture_action(uid,gen_random_uuid(),v_id,'launch','{"style":"hybrid"}');
  raise exception 'Studio launched without equipment and booking';
 exception when raise_exception then
  if SQLERRM<>'Launch requires lighting and a booking system' then raise; end if;
 end;
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'upgrade','{"upgrade":"lighting"}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'upgrade','{"upgrade":"booking"}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'upgrade','{"upgrade":"interior"}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'launch','{"style":"hybrid"}');
 if (select stage from finance_ventures where user_id=uid and venture_id=v_id)<>'operating'
  or (select monthly_profit_cents from finance_assets where user_id=uid and asset_key=asset)<=0
  or (select monthly_cost_cents from finance_assets where user_id=uid and asset_key=asset)<=0
 then raise exception 'Launched studio did not integrate into core finance settlements'; end if;
 req:=gen_random_uuid();before_cash:=(select cash_cents from finance_accounts where user_id=uid);
 perform finance_venture_action(uid,req,v_id,'market','{}');
 after_cash:=(select cash_cents from finance_accounts where user_id=uid);
 if after_cash<>before_cash-120000 then raise exception 'Marketing did not cost exactly once'; end if;
 perform finance_venture_action(uid,req,v_id,'market','{}');
 if (select cash_cents from finance_accounts where user_id=uid)<>after_cash
 then raise exception 'Marketing replay double billed'; end if;
 if (select marketing_level from finance_ventures where user_id=uid and venture_id=v_id)<>1
 then raise exception 'Marketing level incorrect'; end if;
 perform finance_action(uid,gen_random_uuid(),'sell',asset,false);
 if (select stage from finance_ventures where user_id=uid and venture_id=v_id)<>'exited'
 then raise exception 'Selling studio did not archive venture'; end if;
 if exists(select 1 from finance_assets where user_id=uid and asset_key=asset and owned)
 then raise exception 'Sold asset still owned'; end if;
 perform finance_venture_action(uid,gen_random_uuid(),null,'start','{"path":"lease","name":"New Starter Studio"}');
 if (select count(*) from finance_ventures where user_id=uid and stage='research')<>1
 then raise exception 'Cannot start another venture after selling first'; end if;
end $$;
