-- 0086: written management agreement, sourced character decisions and finalized fictional equity.
-- Migration is additive; never treats marriage, a pending offer or an AI guess as consent.
create table if not exists public.finance_agreements (
 user_id uuid not null references auth.users(id) on delete cascade,
 asset_key text not null,
 recipient_character text not null,
 policy_text text not null,
 status text not null default 'delivered'
   check(status in ('delivered','acknowledged','revision_requested','needs_revision')),
 delivered_at timestamptz not null default now(),
 responded_at timestamptz,
 response_message_id uuid,
 primary key(user_id,asset_key,recipient_character),
 foreign key(user_id,asset_key) references finance_assets(user_id,asset_key) on delete cascade
);
create table if not exists public.finance_equity_stakes (
 user_id uuid not null references auth.users(id) on delete cascade,
 asset_key text not null,
 character_key text not null,
 percent integer not null check(percent=50),
 source_offer uuid not null,
 character_balance_cents bigint not null default 0,
 finalized_at timestamptz not null default now(),
 primary key(user_id,asset_key),
 unique(user_id,source_offer),
 foreign key(user_id,asset_key) references finance_assets(user_id,asset_key) on delete cascade,
 foreign key(user_id,source_offer) references finance_equity_offers(user_id,offer_id)
);
create table if not exists public.finance_equity_payouts (
 user_id uuid not null references auth.users(id) on delete cascade,
 source_ledger_id uuid not null references finance_ledger(id) on delete cascade,
 asset_key text not null,
 character_key text not null,
 amount_cents bigint not null,
 created_at timestamptz not null default now(),
 primary key(user_id,source_ledger_id),
 foreign key(user_id,asset_key) references finance_assets(user_id,asset_key) on delete cascade
);
alter table public.finance_agreements enable row level security;
alter table public.finance_equity_stakes enable row level security;
alter table public.finance_equity_payouts enable row level security;
revoke all on public.finance_agreements,public.finance_equity_stakes,public.finance_equity_payouts from anon,authenticated;
grant select,insert,update,delete on public.finance_agreements,public.finance_equity_stakes,public.finance_equity_payouts to service_role;

-- Preserve existing offers while allowing a voluntary, source-backed decision.
alter table finance_equity_offers drop constraint if exists finance_equity_offers_status_check;
alter table finance_equity_offers add constraint finance_equity_offers_status_check
  check(status in ('pending','withdrawn','character_accepted','declined','finalized'));
alter table finance_equity_offers add column if not exists response_message_id uuid;
alter table finance_equity_offers add column if not exists character_responded_at timestamptz;
drop index if exists finance_one_pending_equity_offer;
create unique index finance_one_pending_equity_offer
 on finance_equity_offers(user_id,asset_key,recipient_character)
 where status in ('pending','character_accepted');

create or replace function public.finance_review_snapshot(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 return jsonb_build_object(
 'agreements',coalesce((select jsonb_agg(jsonb_build_object(
   'assetKey',asset_key,'characterKey',recipient_character,'policyText',policy_text,
   'status',status,'deliveredAt',delivered_at,'respondedAt',responded_at) order by delivered_at desc)
   from finance_agreements where user_id=p_user),'[]'::jsonb),
 'stakes',coalesce((select jsonb_agg(jsonb_build_object(
   'assetKey',asset_key,'characterKey',character_key,'percent',percent,
   'partnerBalanceCents',character_balance_cents,'finalizedAt',finalized_at) order by finalized_at desc)
   from finance_equity_stakes where user_id=p_user),'[]'::jsonb),
 'offers',finance_equity_offers_snapshot(p_user));
end $$;
revoke all on function public.finance_review_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.finance_review_snapshot(uuid) to service_role;

create or replace function public.finance_deliver_agreement(
 p_user uuid,p_request uuid,p_asset text,p_character text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a finance_accounts%rowtype; b finance_assets%rowtype; g finance_governance%rowtype;
 policy text;
begin
 perform finance_initialize(p_user);
 select * into a from finance_accounts where user_id=p_user for update;
 if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request)
 then return finance_review_snapshot(p_user); end if;
 if p_character not in ('tess','maya','claire','jordan','ben','sienna','kendra','riley','carly','brooke','jade','nina') or p_character is null
 then raise exception 'Unknown character'; end if;
 select * into b from finance_assets where user_id=p_user and asset_key=p_asset and owned=true for update;
 if not found or b.category<>'business' then raise exception 'Owned operating business required'; end if;
 select * into g from finance_governance where user_id=p_user and asset_key=p_asset and hands_off=true;
 if not found then raise exception 'Save hands-off governance first'; end if;
 if g.operating_manager in ('Existing practice management') or
    g.reports_to in ('Existing supervisory chain') or
    g.independent_hr in ('Independent HR / designated representative')
 then raise exception 'Identify actual fictional manager and independent reviewer roles first'; end if;
 policy:=format(
 'WRITTEN FICTIONAL EMPLOYMENT-BOUNDARIES AGREEMENT FOR %s: 1. The owner is a hands-off investor, not the employee direct supervisor. 2. Daily management is delegated to %s. 3. Employees report through %s. 4. Hiring, pay, schedules, performance, discipline and termination are handled by operational management, not by the owner. 5. Independent employment and relationship conflicts are reviewed by %s, and the owner recuses from all individual decisions affecting a spouse or romantic partner. 6. The employee may request independent advice or revisions. 7. An offer of equity is entirely separate and may be declined without employment or relationship consequences. This is an in-game document, not an executed legal contract or proof of anyone external accepting a role.',
 b.label,g.operating_manager,g.reports_to,g.independent_hr);
 insert into finance_agreements(user_id,asset_key,recipient_character,policy_text,status,delivered_at,responded_at,response_message_id)
 values(p_user,p_asset,p_character,policy,'delivered',now(),null,null)
 on conflict(user_id,asset_key,recipient_character) do update
 set policy_text=excluded.policy_text,status='delivered',delivered_at=now(),responded_at=null,response_message_id=null;
 insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
 values(p_user,p_request,'agreement_delivered',p_asset,0,a.cash_cents,'Written in-game governance policy provided to '||p_character);
 return finance_review_snapshot(p_user);
end $$;
revoke all on function public.finance_deliver_agreement(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finance_deliver_agreement(uuid,uuid,text,text) to service_role;

-- Edits to underlying governance invalidate previous acknowledgement.
create or replace function public.finance_stale_governance_documents()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (new.hands_off,new.operating_manager,new.reports_to,new.independent_hr,new.conflict_recusal)
 is distinct from (old.hands_off,old.operating_manager,old.reports_to,old.independent_hr,old.conflict_recusal) then
  update finance_agreements set status='needs_revision',responded_at=null,response_message_id=null
  where user_id=new.user_id and asset_key=new.asset_key and status in ('delivered','acknowledged','revision_requested');
 end if;
 return new;
end $$;
revoke all on function public.finance_stale_governance_documents() from public,anon,authenticated;
drop trigger if exists finance_stale_governance_documents on finance_governance;
create trigger finance_stale_governance_documents after update on finance_governance
 for each row execute function public.finance_stale_governance_documents();

-- Character choices must originate in a persisted, character-authored message, anchored
-- by an exact visible quote. Do not accept a client-selected "yes" on the character's behalf.
create or replace function public.finance_reconcile_character_message(p_user uuid,p_message uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m record; action_text text; quote_text text; asset text; offer_text text;
 doc finance_agreements%rowtype; o finance_equity_offers%rowtype;
begin
 select msg.id,msg.body,msg.metadata,ch.key as character_key,msg.visible_at
 into m from messages msg
 join conversations cv on cv.id=msg.conversation_id and cv.user_id=p_user
 join characters ch on ch.id=cv.character_id
 where msg.id=p_message and msg.user_id=p_user and msg.sender='tess';
 if not found then raise exception 'Not a character-owned message'; end if;
 if m.visible_at>now() then raise exception 'Message not yet visible'; end if;
 action_text:=m.metadata->'finance_decision'->>'action';
 quote_text:=m.metadata->'finance_decision'->>'quote';
 asset:=m.metadata->'finance_decision'->>'assetKey';
 offer_text:=m.metadata->'finance_decision'->>'offerId';
 if action_text is null or action_text not in ('ack_agreement','request_revision','accept_offer','decline_offer')
 then return finance_review_snapshot(p_user); end if;
 if quote_text is null or length(quote_text)<6 or position(quote_text in m.body)=0
 then raise exception 'Character decision missing exact visible quote'; end if;
 -- Audit is attached to the exact message ID so duplicate reconciliation is harmless.
 if action_text in ('ack_agreement','request_revision') then
  select * into doc from finance_agreements where user_id=p_user and asset_key=asset
   and recipient_character=m.character_key for update;
  if not found or doc.status not in ('delivered','acknowledged','revision_requested')
  then raise exception 'No deliverable agreement awaiting review'; end if;
  if doc.response_message_id=p_message then return finance_review_snapshot(p_user); end if;
  update finance_agreements set status=case when action_text='ack_agreement' then 'acknowledged' else 'revision_requested' end,
   responded_at=now(),response_message_id=p_message
   where user_id=p_user and asset_key=asset and recipient_character=m.character_key;
 else
  if offer_text is null then raise exception 'Missing offer ID'; end if;
  select * into o from finance_equity_offers where user_id=p_user and offer_id=offer_text::uuid
   and recipient_character=m.character_key and asset_key=asset for update;
  if not found then raise exception 'No matching character offer'; end if;
  if o.response_message_id=p_message then return finance_review_snapshot(p_user); end if;
  if o.status<>'pending' then raise exception 'Offer is no longer pending'; end if;
  if action_text='accept_offer' and not exists(
    select 1 from finance_agreements where user_id=p_user and asset_key=asset
     and recipient_character=m.character_key and status='acknowledged'
  ) then raise exception 'Written agreement must be reviewed first'; end if;
  update finance_equity_offers set status=case when action_text='accept_offer' then 'character_accepted' else 'declined' end,
    character_responded_at=now(),response_message_id=p_message,closed_at=case when action_text='decline_offer' then now() else null end
    where user_id=p_user and offer_id=o.offer_id;
 end if;
 return finance_review_snapshot(p_user);
end $$;
revoke all on function public.finance_reconcile_character_message(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finance_reconcile_character_message(uuid,uuid) to service_role;

-- An explicit owner finalization is necessary after the independent character says yes.
create or replace function public.finance_finalize_equity(
 p_user uuid,p_request uuid,p_offer uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a finance_accounts%rowtype; b finance_assets%rowtype; o finance_equity_offers%rowtype;
begin
 perform finance_initialize(p_user);
 select * into a from finance_accounts where user_id=p_user for update;
 if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request)
 then return finance_review_snapshot(p_user); end if;
 select * into o from finance_equity_offers where user_id=p_user and offer_id=p_offer for update;
 if not found or o.status<>'character_accepted' or o.response_message_id is null
 then raise exception 'Explicit character acceptance required'; end if;
 select * into b from finance_assets where user_id=p_user and asset_key=o.asset_key for update;
 if not found or not b.owned or b.category<>'business'
 then raise exception 'Owned operating business required'; end if;
 if exists(select 1 from finance_equity_stakes where user_id=p_user and asset_key=o.asset_key)
 then raise exception 'Business already has an equity partner'; end if;
 if not exists(select 1 from finance_agreements where user_id=p_user and asset_key=o.asset_key
   and recipient_character=o.recipient_character and status='acknowledged')
 then raise exception 'Independent written boundaries must be acknowledged'; end if;
 if not exists(select 1 from finance_governance where user_id=p_user and asset_key=o.asset_key and hands_off=true)
 then raise exception 'Independent management must remain active'; end if;
 insert into finance_equity_stakes(user_id,asset_key,character_key,percent,source_offer)
 values(p_user,o.asset_key,o.recipient_character,50,o.offer_id);
 update finance_equity_offers set status='finalized',closed_at=now() where user_id=p_user and offer_id=p_offer;
 insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
 values(p_user,p_request,'equity_finalized',o.asset_key,0,a.cash_cents,
   'Fictional 50% partnership activated after documented explicit character acceptance and owner confirmation');
 return finance_review_snapshot(p_user);
end $$;
revoke all on function public.finance_finalize_equity(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.finance_finalize_equity(uuid,uuid,uuid) to service_role;

-- Shared assets cannot be sold unilaterally. A future joint sale workflow must distribute both stakes.
create or replace function public.finance_joint_sale_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.owned=true and new.owned=false and exists(
  select 1 from finance_equity_stakes where user_id=old.user_id and asset_key=old.asset_key
 ) then raise exception 'Jointly owned business requires both owners for sale'; end if;
 return new;
end $$;
revoke all on function public.finance_joint_sale_guard() from public,anon,authenticated;
drop trigger if exists finance_joint_sale_guard on finance_assets;
create trigger finance_joint_sale_guard before update of owned on finance_assets
for each row execute function public.finance_joint_sale_guard();

-- Split *actual* personal distributions from business reserves between game-world owners.
-- Ledger trigger fires only after finance engine's monthly settlement/manual owner draw,
-- while the account is already locked by its originating finance RPC.
create or replace function public.finance_split_partner_distributions()
returns trigger language plpgsql security definer set search_path=public as $$
declare stake finance_equity_stakes%rowtype; share bigint;
begin
 if new.event_type not in ('owner_draw','monthly_settlement') or new.asset_key is null or new.amount_cents=0
 then return null; end if;
 select * into stake from finance_equity_stakes
  where user_id=new.user_id and asset_key=new.asset_key for update;
 if not found then return null; end if;
 share:=trunc(new.amount_cents::numeric*stake.percent/100)::bigint;
 if share=0 then return null; end if;
 update finance_accounts set cash_cents=cash_cents-share where user_id=new.user_id;
 update finance_equity_stakes set character_balance_cents=character_balance_cents+share
 where user_id=new.user_id and asset_key=new.asset_key;
 insert into finance_equity_payouts(user_id,source_ledger_id,asset_key,character_key,amount_cents)
 values(new.user_id,new.id,new.asset_key,stake.character_key,share);
 update finance_ledger set amount_cents=amount_cents-share,cash_after_cents=cash_after_cents-share,
 note=note||'; shared with 50% fictional co-owner'
 where id=new.id;
 return null;
end $$;
revoke all on function public.finance_split_partner_distributions() from public,anon,authenticated;
drop trigger if exists finance_split_partner_distributions on finance_ledger;
create trigger finance_split_partner_distributions after insert on finance_ledger
for each row execute function public.finance_split_partner_distributions();

-- Reconcile account balances after the source-ledger co-owner distribution trigger.
create or replace function public.finance_monthly_tick(p_user uuid,p_today date default current_date)
returns integer language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype; b finance_assets%rowtype; m date;
  cash_delta bigint; principal_payment bigint; interest_payment bigint; applied integer:=0; payroll bigint; named_count integer;
  gross bigint; realized_revenue bigint; draw_amount bigint; shortfall bigint; months_owned integer;
  virtual_today date; virtual_start date; virtual_owned_since date;
begin
  -- Background jobs must not create a millionaire account for users who never opted into finances.
  if not exists(select 1 from finance_accounts where user_id=p_user) then return 0; end if;
  select * into a from finance_accounts where user_id=p_user for update;
  virtual_start:=(a.created_at at time zone 'America/New_York')::date;
  virtual_today:=finance_virtual_date(virtual_start,p_today);
  -- 1 real calendar day = 7 fictional finance days; never advance unrelated world events.
  -- Settlements are bounded to 12 completed virtual months per request, never future months.
  for b in select * from finance_assets where user_id=p_user and owned=true for update loop
    virtual_owned_since:=finance_virtual_date(virtual_start,(b.owner_since at time zone 'America/New_York')::date);
    for m in select gs::date from generate_series(
      greatest(date_trunc('month',virtual_owned_since)::date, (date_trunc('month',virtual_today)-interval '12 months')::date),
      (date_trunc('month',virtual_today)-interval '1 month')::date,interval '1 month') gs loop
      insert into finance_cycles(user_id,asset_key,cycle_month) values(p_user,b.asset_key,m)
      on conflict do nothing;
      if not found then continue; end if;
      interest_payment:=case when b.loan_cents>0 then (b.loan_cents*b.loan_rate_bps+119999)/120000 else 0 end;
      principal_payment:=case when b.loan_months_left>0 then (b.loan_cents+b.loan_months_left-1)/b.loan_months_left else 0 end;
      select coalesce(sum(salary_cents),0),count(*) into payroll,named_count from finance_workers where user_id=p_user and asset_key=b.asset_key and active;
      payroll:=payroll+greatest(0,b.staff_count-named_count)*300000;
      -- Revenue grows by 2% at three-month ownership milestones, capped at 200% of the initial revenue.
      months_owned:=greatest(0,((extract(year from age(m,virtual_owned_since))::int)*12+
        extract(month from age(m,virtual_owned_since))::int));
      gross:=b.monthly_profit_cents;
      if months_owned>0 and mod(months_owned,3)=0 then
        gross:=least(ceil(gross*1.02)::bigint,b.baseline_revenue_cents*2);
      end if;
      -- Deterministic monthly customer demand swings between -6% and +6%,
      -- based on the asset and virtual month, without changing the growth baseline.
      realized_revenue:=(gross*(94+mod(hashtext(b.asset_key||':'||m::text)::bigint+2147483648,13)))/100;
      cash_delta:=realized_revenue-b.monthly_cost_cents-payroll-principal_payment-interest_payment;
      if cash_delta>=0 then
        draw_amount:=floor(cash_delta*b.owner_draw_pct/100.0)::bigint;
        update finance_assets set company_reserves_cents=company_reserves_cents+cash_delta-draw_amount,
          monthly_profit_cents=gross,loan_cents=greatest(0,loan_cents-principal_payment),
          loan_months_left=greatest(0,loan_months_left-1)
        where user_id=p_user and asset_key=b.asset_key;
        update finance_accounts set cash_cents=cash_cents+draw_amount
          where user_id=p_user returning * into a;
      else
        shortfall:=greatest(0,-cash_delta-b.company_reserves_cents);
        if a.cash_cents<shortfall then raise exception 'Unable to cover business operating deficit'; end if;
        draw_amount:=-shortfall;
        update finance_assets set company_reserves_cents=greatest(0,company_reserves_cents+cash_delta),
          monthly_profit_cents=gross,loan_cents=greatest(0,loan_cents-principal_payment),
          loan_months_left=greatest(0,loan_months_left-1)
        where user_id=p_user and asset_key=b.asset_key;
        update finance_accounts set cash_cents=cash_cents-shortfall
          where user_id=p_user returning * into a;
      end if;
      insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
      values(p_user,gen_random_uuid(),'monthly_settlement',b.asset_key,draw_amount,a.cash_cents,
        'Operations / turnover '||(realized_revenue/100)::text||' USD, net '||(cash_delta/100)::text||' USD, owner draw '||(draw_amount/100)::text||' USD, month '||to_char(m,'YYYY-MM'));
      -- A 50% partner payout may have adjusted the player's balance in the ledger
      -- trigger. Reload before checking the next business's expenses.
      select * into a from finance_accounts where user_id=p_user;
      b.company_reserves_cents:=case when cash_delta>=0 then b.company_reserves_cents+cash_delta-draw_amount else greatest(0,b.company_reserves_cents+cash_delta) end;
      b.monthly_profit_cents:=gross;
      b.loan_cents:=greatest(0,b.loan_cents-principal_payment);
      b.loan_months_left:=greatest(0,b.loan_months_left-1);
      applied:=applied+1;
    end loop;
  end loop;
  -- Player salary arrives monthly irrespective of asset ownership, but only once.
  for m in select gs::date from generate_series(
    greatest(date_trunc('month',virtual_start)::date,(date_trunc('month',virtual_today)-interval '12 months')::date),
    (date_trunc('month',virtual_today)-interval '1 month')::date,interval '1 month') gs loop
    insert into finance_income_cycles(user_id,cycle_month) values(p_user,m) on conflict do nothing;
    if found then
      update finance_accounts set cash_cents=cash_cents+10000000 where user_id=p_user returning * into a;
      insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
      values(p_user,gen_random_uuid(),'player_salary',null,10000000,a.cash_cents,'Virtual executive salary '||to_char(m,'YYYY-MM'));
      applied:=applied+1;
    end if;
  end loop;
  return applied;
end $$;


-- Once a character owns a fictional stake, no later user-only offer may overwrite it.
create or replace function public.finance_no_second_equity_offer()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from finance_equity_stakes where user_id=new.user_id and asset_key=new.asset_key)
 then raise exception 'Business already has an equity partner'; end if;
 return new;
end $$;
revoke all on function public.finance_no_second_equity_offer() from public,anon,authenticated;
drop trigger if exists finance_no_second_equity_offer on finance_equity_offers;
create trigger finance_no_second_equity_offer before insert on finance_equity_offers
for each row execute function public.finance_no_second_equity_offer();

-- An active 50/50 partnership has only half of the portfolio value in the player's net worth.
-- This is exposed separately so existing snapshot contracts remain backward-compatible.
create or replace function public.finance_owned_equity_value(p_user uuid)
returns bigint language sql security definer set search_path=public as $$
 select coalesce(sum(
   (a.price_cents + a.company_reserves_cents - a.loan_cents) *
   (100-coalesce(s.percent,0))/100),0)::bigint
 from finance_assets a left join finance_equity_stakes s
  on s.user_id=a.user_id and s.asset_key=a.asset_key
 where a.user_id=p_user and a.owned=true;
$$;
revoke all on function public.finance_owned_equity_value(uuid) from public,anon,authenticated;
grant execute on function public.finance_owned_equity_value(uuid) to service_role;

-- Before finalization the player may withdraw even a character-accepted offer.
create or replace function public.finance_equity_offer_command(
 p_user uuid,p_request uuid,p_action text,p_asset text,p_character text,p_offer uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a finance_accounts%rowtype;
begin
 perform finance_initialize(p_user);
 select * into a from finance_accounts where user_id=p_user for update;
 if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request)
 then return finance_equity_offers_snapshot(p_user); end if;
 if p_action='offer_half' then
  if p_character is null or p_character not in
    ('tess','maya','claire','jordan','ben','sienna','kendra','riley','carly','brooke','jade','nina')
  then raise exception 'Unknown character'; end if;
  if not exists(select 1 from finance_assets where user_id=p_user and
    asset_key=p_asset and category='business' and owned=true)
  then raise exception 'Owned operating business required'; end if;
  if not exists(select 1 from finance_governance where user_id=p_user and
    asset_key=p_asset and hands_off=true)
  then raise exception 'Save hands-off governance before proposing co-ownership'; end if;
  if exists(select 1 from finance_equity_offers where user_id=p_user and
    asset_key=p_asset and recipient_character=p_character and status in ('pending','character_accepted'))
  then raise exception 'An unanswered offer already exists'; end if;
  insert into finance_equity_offers(user_id,asset_key,recipient_character,percentage)
  values(p_user,p_asset,p_character,50);
 elsif p_action='withdraw' then
  update finance_equity_offers set status='withdrawn',closed_at=now()
  where user_id=p_user and offer_id=p_offer and status in ('pending','character_accepted');
  if not found then raise exception 'No outstanding offer to withdraw'; end if;
 else raise exception 'Unknown offer action'; end if;
 insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
 values(p_user,p_request,'equity_'||p_action,p_asset,0,a.cash_cents,
   'Fictional optional co-ownership proposal; no equity changed');
 return finance_equity_offers_snapshot(p_user);
end $$;
