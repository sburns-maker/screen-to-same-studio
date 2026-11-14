do $$
declare
 uid uuid:='11111111-1111-1111-1111-111111111111';
 other_id uuid:='22222222-2222-2222-2222-222222222222';
 result jsonb; req uuid; offer uuid;
begin
 if has_table_privilege('anon','public.finance_governance','SELECT') then
  raise exception 'Governance data leaked to anon'; end if;
 if has_table_privilege('authenticated','public.finance_equity_offers','SELECT') then
  raise exception 'Offers leaked to authenticated users'; end if;
 if has_function_privilege('authenticated','public.finance_governance_save(uuid,uuid,text,boolean,text,text,text)','EXECUTE') then
  raise exception 'Governance RPC is public'; end if;

 -- Northlight was acquired in management tests. No change in ownership on delegation.
 req:=gen_random_uuid();
 result:=finance_governance_save(uid,req,'work:northlight',true,'Independent General Manager',
  'Practice clinical supervisor','Independent HR Officer');
 if jsonb_array_length(result)<>1 then raise exception 'Governance missing'; end if;
 if (result->0->>'handsOff')::boolean is distinct from true then
  raise exception 'Hands-off policy not recorded'; end if;
 result:=finance_governance_save(uid,req,'work:northlight',true,'Independent General Manager',
  'Practice clinical supervisor','Independent HR Officer');
 if (select count(*) from finance_ledger where user_id=uid and request_id=req)<>1
 then raise exception 'Duplicate governance request mutated ledger'; end if;
 begin
  perform finance_set_salary(uid,gen_random_uuid(),'work:northlight','kendra',800000);
  raise exception 'Raise should not bypass independent management';
 exception when raise_exception then
  if SQLERRM<>'Hands-off ownership: direct staff decisions are delegated' then raise; end if;
 end;
 begin
  perform finance_manage(uid,gen_random_uuid(),'hire',
    '{"assetKey":"work:northlight","name":"Temporary worker","monthlyCents":300000}'::jsonb);
  raise exception 'Hiring should not bypass independent management';
 exception when raise_exception then
  if SQLERRM<>'Hands-off ownership: direct staff decisions are delegated' then raise; end if;
 end;

 req:=gen_random_uuid();
 result:=finance_equity_offer_command(uid,req,'offer_half','work:northlight','tess',null);
 select offer_id into offer from finance_equity_offers
  where user_id=uid and asset_key='work:northlight' and recipient_character='tess' and status='pending';
 if offer is null then raise exception 'Voluntary offer was not recorded'; end if;
 if (select owned from finance_assets where user_id=uid and asset_key='work:northlight') is distinct from true
 then raise exception 'Offer changed existing ownership'; end if;
 if (select count(*) from finance_ledger where user_id=uid and request_id=req)<>1
 then raise exception 'Offer missing ledger receipt'; end if;
 result:=finance_equity_offer_command(uid,req,'offer_half','work:northlight','tess',null);
 if (select count(*) from finance_equity_offers where user_id=uid and asset_key='work:northlight'
  and recipient_character='tess')<>1
 then raise exception 'Duplicate offer'; end if;
 begin
  perform finance_equity_offer_command(uid,gen_random_uuid(),'offer_half','work:northlight','tess',null);
  raise exception 'Second pending offer was allowed';
 exception when raise_exception then
  if SQLERRM<>'An unanswered offer already exists' then raise; end if;
 end;
 if exists(select 1 from finance_equity_offers where user_id=other_id)
 then raise exception 'Offers leaked to other player'; end if;
 if (select cash_cents from finance_accounts where user_id=uid)<0
 then raise exception 'Financial assets unexpectedly mutated'; end if;
 result:=finance_equity_offer_command(uid,gen_random_uuid(),'withdraw','','',offer);
 if exists(select 1 from finance_equity_offers where user_id=uid and offer_id=offer and status='pending')
 then raise exception 'Offer withdraw did not close proposal'; end if;
end $$;