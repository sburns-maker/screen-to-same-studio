-- Test-only character dialogue fixture + agreement/equity end-to-end.
create table if not exists public.characters(id uuid primary key,key text not null);
create table if not exists public.conversations(id uuid primary key,user_id uuid not null,character_id uuid not null);
create table if not exists public.messages(
 id uuid primary key,user_id uuid not null,conversation_id uuid not null,
 sender text not null,body text not null,metadata jsonb not null default '{}'::jsonb,
 visible_at timestamptz not null default now()
);
do $$
declare
 uid uuid:='11111111-1111-1111-1111-111111111111';
 other_id uuid:='22222222-2222-2222-2222-222222222222';
 cv uuid:=gen_random_uuid(); ch uuid:=gen_random_uuid(); msg uuid;
 req uuid; offer uuid; snap jsonb; quote text;
 cash_before bigint; partner_before bigint; reserves_before bigint;
begin
 insert into characters(id,key) values(ch,'tess');
 insert into conversations(id,user_id,character_id) values(cv,uid,ch);
 if has_table_privilege('anon','public.finance_agreements','SELECT') or
    has_table_privilege('authenticated','public.finance_equity_stakes','SELECT')
 then raise exception 'Private financial agreements/equity exposed'; end if;
 if has_function_privilege('authenticated','public.finance_finalize_equity(uuid,uuid,uuid)','EXECUTE')
 then raise exception 'Equity finalization exposed to browser'; end if;

 req:=gen_random_uuid();
 snap:=finance_deliver_agreement(uid,req,'work:northlight','tess');
 if (select status from finance_agreements where user_id=uid and asset_key='work:northlight'
     and recipient_character='tess')<>'delivered'
 then raise exception 'Written employment agreement not delivered'; end if;
 if (select policy_text from finance_agreements where user_id=uid and asset_key='work:northlight'
     and recipient_character='tess') not like '%Independent HR Officer%'
 then raise exception 'Written independent reporting terms omitted'; end if;
 snap:=finance_deliver_agreement(uid,req,'work:northlight','tess');
 if (select count(*) from finance_ledger where user_id=uid and request_id=req)<>1
 then raise exception 'Duplicate agreement delivery'; end if;
 snap:=finance_equity_offer_command(uid,gen_random_uuid(),'offer_half','work:northlight','tess',null);
 select offer_id into offer from finance_equity_offers
 where user_id=uid and asset_key='work:northlight' and recipient_character='tess' and status='pending';
 if offer is null then raise exception 'New voluntary offer absent'; end if;

 -- A message saying yes to an offer without first acknowledging the written policy
 -- must not finalize or even register character consent.
 msg:=gen_random_uuid();quote:='I accept the half-ownership offer.';
 insert into messages(id,user_id,conversation_id,sender,body,visible_at,metadata)
 values(msg,uid,cv,'tess',quote,now()-interval '1 minute',
 jsonb_build_object('finance_decision',jsonb_build_object('action','accept_offer',
 'assetKey','work:northlight','offerId',offer,'quote',quote)));
 begin
  perform finance_reconcile_character_message(uid,msg);
  raise exception 'Premature equity acceptance was allowed';
 exception when raise_exception then
  if SQLERRM<>'Written agreement must be reviewed first' then raise; end if;
 end;
 if (select status from finance_equity_offers where user_id=uid and offer_id=offer)<>'pending'
 then raise exception 'Premature acceptance changed offer'; end if;
 begin
  perform finance_finalize_equity(uid,gen_random_uuid(),offer);
  raise exception 'Player finalized without character consent';
 exception when raise_exception then
  if SQLERRM<>'Explicit character acceptance required' then raise; end if;
 end;

 msg:=gen_random_uuid();quote:='I reviewed the written boundaries and accept them.';
 insert into messages(id,user_id,conversation_id,sender,body,visible_at,metadata)
 values(msg,uid,cv,'tess',quote,now()-interval '1 minute',
 jsonb_build_object('finance_decision',jsonb_build_object('action','ack_agreement',
 'assetKey','work:northlight','offerId',null,'quote',quote)));
 snap:=finance_reconcile_character_message(uid,msg);
 if (select status from finance_agreements where user_id=uid and asset_key='work:northlight'
    and recipient_character='tess')<>'acknowledged'
 then raise exception 'Written agreement not acknowledged'; end if;
 snap:=finance_reconcile_character_message(uid,msg);
 if (select status from finance_agreements where user_id=uid and asset_key='work:northlight'
    and recipient_character='tess')<>'acknowledged'
 then raise exception 'Repeated receipt reverted acknowledgment'; end if;

 msg:=gen_random_uuid(); quote:='Having considered the terms, I accept the 50% equity offer.';
 insert into messages(id,user_id,conversation_id,sender,body,visible_at,metadata)
 values(msg,uid,cv,'tess',quote,now()-interval '1 minute',
 jsonb_build_object('finance_decision',jsonb_build_object('action','accept_offer',
 'assetKey','work:northlight','offerId',offer,'quote',quote)));
 snap:=finance_reconcile_character_message(uid,msg);
 if (select status from finance_equity_offers where user_id=uid and offer_id=offer)<>'character_accepted'
 then raise exception 'Explicit acceptance not recorded'; end if;
 if exists(select 1 from finance_equity_stakes where user_id=uid and asset_key='work:northlight')
 then raise exception 'Character yes automatically transferred equity'; end if;

 req:=gen_random_uuid();
 snap:=finance_finalize_equity(uid,req,offer);
 snap:=finance_finalize_equity(uid,req,offer);
 if (select count(*) from finance_equity_stakes where user_id=uid and asset_key='work:northlight'
    and character_key='tess' and percent=50)<>1
 then raise exception 'Mutual equity not finalized exactly once'; end if;
 if (select status from finance_equity_offers where user_id=uid and offer_id=offer)<>'finalized'
 then raise exception 'Finalized offer status mismatch'; end if;
 if exists(select 1 from finance_equity_stakes where user_id=other_id)
 then raise exception 'Equity leaked across users'; end if;

 perform finance_monthly_tick(uid,(current_date+interval '25 days')::date);
 reserves_before:=(select company_reserves_cents from finance_assets where user_id=uid and asset_key='work:northlight');
 if reserves_before<10000 then raise exception 'Need retained company reserves for shared draw test'; end if;
 cash_before:=(select cash_cents from finance_accounts where user_id=uid);
 partner_before:=(select character_balance_cents from finance_equity_stakes
  where user_id=uid and asset_key='work:northlight');
 req:=gen_random_uuid();
 perform finance_owner_draw(uid,req,'work:northlight',10000);
 if (select cash_cents from finance_accounts where user_id=uid)<>cash_before+5000
 then raise exception 'Player did not receive 50 percent of draw'; end if;
 if (select character_balance_cents from finance_equity_stakes
  where user_id=uid and asset_key='work:northlight')<>partner_before+5000
 then raise exception 'Character did not receive equal 50 percent payout'; end if;
 if (select count(*) from finance_equity_payouts where user_id=uid and asset_key='work:northlight')<1
 then raise exception 'Shareholder payouts have no audit receipt'; end if;
 if (select company_reserves_cents from finance_assets where user_id=uid and asset_key='work:northlight')<>reserves_before-10000
 then raise exception 'The business was charged twice for owner draw'; end if;
 perform finance_owner_draw(uid,req,'work:northlight',10000);
 if (select cash_cents from finance_accounts where user_id=uid)<>cash_before+5000
 then raise exception 'Duplicate shareholder draw'; end if;

 begin
  perform finance_action(uid,gen_random_uuid(),'sell','work:northlight',false);
  raise exception 'Player sold jointly-owned asset without co-owner agreement';
 exception when raise_exception then
  if SQLERRM<>'Jointly owned business requires both owners for sale' then raise; end if;
 end;
 if (select finance_owned_equity_value(uid)) >=
    (select coalesce(sum(price_cents+company_reserves_cents-loan_cents),0)
     from finance_assets where user_id=uid and owned=true)
 then raise exception 'Net worth fails to account for transferred half equity'; end if;

 -- The player cannot issue another 50% offer after finalization.
 begin
  perform finance_equity_offer_command(uid,gen_random_uuid(),'offer_half','work:northlight','claire',null);
  raise exception 'Additional coowner offer allowed despite a recorded 50 percent stake';
 exception when raise_exception then
  if SQLERRM<>'Business already has an equity partner' then raise; end if;
 end;
end $$;
