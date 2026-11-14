do $$
declare
 uid uuid:='11111111-1111-1111-1111-111111111111';
 other_id uuid:='22222222-2222-2222-2222-222222222222';
 draft text;
 old_delivered text;
 req uuid;
 response jsonb;
begin
 if has_table_privilege('anon','public.finance_agreement_drafts','SELECT')
  or has_table_privilege('authenticated','public.finance_agreement_drafts','SELECT')
 then raise exception 'Private document drafts exposed'; end if;
 if has_function_privilege('authenticated','public.finance_agreement_draft_save(uuid,uuid,text,text,text)','EXECUTE')
 then raise exception 'Private document edit callable by client'; end if;
 if (select count(*) from finance_agreements where user_id=uid and asset_key='work:northlight' and recipient_character='tess')<>1
 then raise exception 'Test requires already delivered document'; end if;
 old_delivered:=(select policy_text from finance_agreements where user_id=uid and asset_key='work:northlight' and recipient_character='tess');
 draft:='SIMULATED WRITTEN PRACTICE POLICY. Tess is the Operations Manager. Elaine Mercer is the General Manager and independently supervises Tess. Dr. Daniel Whitcomb is the Clinical Director and handles clinical oversight. Morgan Ellis is the independent HR and conflict reviewer. The owner has no role in Tess''s pay, scheduling, discipline or performance decisions. Personal and employment concerns go through independent management. Ownership offers are separate and optional.';
 req:=gen_random_uuid();
 response:=finance_agreement_draft_save(uid,req,'work:northlight','tess',draft);
 if response->>'text'<>draft then raise exception 'Edited document was not saved'; end if;
 response:=finance_agreement_draft_save(uid,req,'work:northlight','tess',draft);
 if (select count(*) from finance_ledger where user_id=uid and request_id=req)<>1
 then raise exception 'Save draft repeated audit receipt'; end if;
 if (select policy_text from finance_agreements where user_id=uid and asset_key='work:northlight' and recipient_character='tess')<>old_delivered
 then raise exception 'Saving draft overwrote previously delivered agreement'; end if;
 if (select status from finance_agreements where user_id=uid and asset_key='work:northlight' and recipient_character='tess')<>'acknowledged'
 then raise exception 'Editing draft incorrectly reset prior acknowledgement'; end if;
 if exists(select 1 from finance_agreement_drafts where user_id=other_id)
 then raise exception 'Draft leaked to another player'; end if;
 response:=finance_deliver_agreement(uid,gen_random_uuid(),'work:northlight','tess');
 if (select policy_text from finance_agreements where user_id=uid and asset_key='work:northlight' and recipient_character='tess')<>draft
 then raise exception 'Delivered document did not use custom full text'; end if;
 if (select status from finance_agreements where user_id=uid and asset_key='work:northlight' and recipient_character='tess')<>'delivered'
 then raise exception 'Revision did not require fresh character acknowledgment'; end if;
 if position('Dr. Daniel Whitcomb' in (select policy_text from finance_agreements where user_id=uid and asset_key='work:northlight' and recipient_character='tess'))=0
 then raise exception 'Clinical director disappeared from delivered custom text'; end if;
end $$;
