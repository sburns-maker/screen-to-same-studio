-- Must run after the 0088 venture lifecycle integration test.
do $$
declare
 uid uuid:='11111111-1111-1111-1111-111111111111';
 outsider uuid:='22222222-2222-2222-2222-222222222222';
 v_id uuid; a_key text; session uuid; cancel_id uuid; req uuid;
 vday date; reserved_before bigint; snap jsonb; c bigint;
begin
 if has_table_privilege('authenticated','public.finance_studio_sessions','SELECT') or
  has_function_privilege('authenticated','public.finance_studio_session_action(uuid,uuid,uuid,text,jsonb)','EXECUTE')
 then raise exception 'Private booking data or actions exposed'; end if;
 select venture_id into v_id from finance_ventures where user_id=uid and stage='research';
 if v_id is null then raise exception 'Expected an available follow-up studio'; end if;
 begin
  perform finance_studio_session_action(uid,gen_random_uuid(),v_id,'schedule',
    '{"service":"portrait","virtualDate":"2030-01-01"}');
  raise exception 'Unlaunched studio allowed sessions';
 exception when raise_exception then
  if SQLERRM<>'Operating studio required' then raise; end if;
 end;
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'inspect','{"check":"books"}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'inspect','{"check":"space"}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'inspect','{"check":"permits"}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'offer','{"offerCents":650000,"financing":"cash"}');
 update finance_ventures set offer_due_virtual=current_date-1 where user_id=uid and venture_id=v_id;
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'respond','{}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'close','{}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'upgrade','{"upgrade":"lighting"}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'upgrade','{"upgrade":"booking"}');
 perform finance_venture_action(uid,gen_random_uuid(),v_id,'launch','{"style":"portraits"}');
 select asset_key into a_key from finance_ventures where user_id=uid and venture_id=v_id;
 select * into vday from (select finance_virtual_date((created_at at time zone 'America/New_York')::date,
 (now() at time zone 'America/New_York')::date) as d from finance_accounts where user_id=uid) x;
 reserved_before:=(select company_reserves_cents from finance_assets where user_id=uid and asset_key=a_key);
 req:=gen_random_uuid();
 snap:=finance_studio_session_action(uid,req,v_id,'schedule',
  jsonb_build_object('service','portrait','virtualDate',(vday+7)::text));
 select session_id into session from finance_studio_sessions
 where user_id=uid and venture_id=v_id and status='scheduled' limit 1;
 if session is null then raise exception 'Booking not persisted'; end if;
 perform finance_studio_session_action(uid,req,v_id,'schedule',
  jsonb_build_object('service','portrait','virtualDate',(vday+7)::text));
 if (select count(*) from finance_studio_sessions where user_id=uid and venture_id=v_id)<>1
 then raise exception 'Duplicate booking on request replay'; end if;
 if (select company_reserves_cents from finance_assets where user_id=uid and asset_key=a_key)<>reserved_before
 then raise exception 'Holding a deposit counted as income before completion'; end if;
 begin
  perform finance_studio_session_action(uid,gen_random_uuid(),v_id,'complete',
   jsonb_build_object('sessionId',session));
  raise exception 'Future booking completed instantly';
 exception when raise_exception then
  if SQLERRM<>'Cannot complete a future session' then raise; end if;
 end;
 update finance_studio_sessions set session_virtual_date=vday where user_id=uid and session_id=session;
 req:=gen_random_uuid();
 perform finance_studio_session_action(uid,req,v_id,'complete',jsonb_build_object('sessionId',session));
 c:=(select company_reserves_cents from finance_assets where user_id=uid and asset_key=a_key);
 if c<>reserved_before+29000 then raise exception 'Net revenue not credited to studio reserves'; end if;
 perform finance_studio_session_action(uid,req,v_id,'complete',jsonb_build_object('sessionId',session));
 if (select company_reserves_cents from finance_assets where user_id=uid and asset_key=a_key)<>c
 then raise exception 'Duplicate session completion credited income twice'; end if;
 snap:=finance_studio_session_action(uid,gen_random_uuid(),v_id,'schedule',
  jsonb_build_object('service','rental','virtualDate',(vday+14)::text));
 select session_id into cancel_id from finance_studio_sessions
 where user_id=uid and venture_id=v_id and service='rental' and status='scheduled';
 perform finance_studio_session_action(uid,gen_random_uuid(),v_id,'cancel',jsonb_build_object('sessionId',cancel_id));
 if (select company_reserves_cents from finance_assets where user_id=uid and asset_key=a_key)<>c
 then raise exception 'Cancellation unexpectedly credited company reserves'; end if;
 if exists(select 1 from finance_studio_sessions where user_id=outsider)
 then raise exception 'Booking data leaked between player accounts'; end if;
end $$;
