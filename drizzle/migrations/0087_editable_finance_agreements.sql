-- 0087: user-editable written agreement drafts, independent of delivery/acceptance.
-- Edits are private and do not silently rewrite a document a character already reviewed.
create table if not exists public.finance_agreement_drafts (
 user_id uuid not null references auth.users(id) on delete cascade,
 asset_key text not null,
 recipient_character text not null,
 draft_text text not null check(char_length(draft_text) between 150 and 12000),
 updated_at timestamptz not null default now(),
 primary key(user_id,asset_key,recipient_character),
 foreign key(user_id,asset_key) references finance_assets(user_id,asset_key) on delete cascade
);
alter table public.finance_agreement_drafts enable row level security;
revoke all on public.finance_agreement_drafts from anon,authenticated;
grant select,insert,update,delete on public.finance_agreement_drafts to service_role;

create or replace function public.finance_agreement_draft_read(p_user uuid,p_asset text,p_character text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b finance_assets%rowtype;
begin
 select * into b from finance_assets where user_id=p_user and asset_key=p_asset and owned=true;
 if not found or b.category<>'business' then raise exception 'Owned operating business required'; end if;
 return coalesce((select jsonb_build_object('text',draft_text,'updatedAt',updated_at)
  from finance_agreement_drafts where user_id=p_user and asset_key=p_asset and recipient_character=p_character),
  'null'::jsonb);
end $$;
revoke all on function public.finance_agreement_draft_read(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finance_agreement_draft_read(uuid,text,text) to service_role;

create or replace function public.finance_agreement_draft_save(p_user uuid,p_request uuid,p_asset text,p_character text,p_text text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a finance_accounts%rowtype; b finance_assets%rowtype;
begin
 if p_character is null or p_character not in
 ('tess','maya','claire','jordan','ben','sienna','kendra','riley','carly','brooke','jade','nina')
 then raise exception 'Unknown character'; end if;
 if p_text is null or char_length(btrim(p_text)) not between 150 and 12000
  or p_text ~ '[[:cntrl:]&&[^\n\r\t]]'
 then raise exception 'Invalid agreement draft'; end if;
 perform finance_initialize(p_user);
 select * into a from finance_accounts where user_id=p_user for update;
 if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request)
 then return finance_agreement_draft_read(p_user,p_asset,p_character); end if;
 select * into b from finance_assets where user_id=p_user and asset_key=p_asset for update;
 if not found or not b.owned or b.category<>'business'
 then raise exception 'Owned operating business required'; end if;
 if not exists(select 1 from finance_governance where user_id=p_user and asset_key=p_asset and hands_off=true)
 then raise exception 'Save hands-off governance first'; end if;
 insert into finance_agreement_drafts(user_id,asset_key,recipient_character,draft_text)
 values (p_user,p_asset,p_character,btrim(p_text))
 on conflict(user_id,asset_key,recipient_character) do update
 set draft_text=excluded.draft_text,updated_at=now();
 insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
 values(p_user,p_request,'agreement_draft',p_asset,0,a.cash_cents,'Edited private written policy draft for '||p_character);
 return finance_agreement_draft_read(p_user,p_asset,p_character);
end $$;
revoke all on function public.finance_agreement_draft_save(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finance_agreement_draft_save(uuid,uuid,text,text,text) to service_role;

-- Retain the original safety/recipient validation and audit behavior of 0086.
-- Only the text source changes when a custom draft has been explicitly saved.
create or replace function public.finance_deliver_agreement(
 p_user uuid,p_request uuid,p_asset text,p_character text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a finance_accounts%rowtype; b finance_assets%rowtype; g finance_governance%rowtype;
 policy text; custom_policy text;
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
 select draft_text into custom_policy from finance_agreement_drafts where user_id=p_user and asset_key=p_asset and recipient_character=p_character;
 if custom_policy is not null then policy:=custom_policy; end if;
 insert into finance_agreements(user_id,asset_key,recipient_character,policy_text,status,delivered_at,responded_at,response_message_id)
 values(p_user,p_asset,p_character,policy,'delivered',now(),null,null)
 on conflict(user_id,asset_key,recipient_character) do update
 set policy_text=excluded.policy_text,status='delivered',delivered_at=now(),responded_at=null,response_message_id=null;
 insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
 values(p_user,p_request,'agreement_delivered',p_asset,0,a.cash_cents,'Written in-game governance policy provided to '||p_character);
 return finance_review_snapshot(p_user);
end $$;

