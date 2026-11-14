do $$
declare uid uuid:='11111111-1111-1111-1111-111111111111';
  changed jsonb; req uuid:=gen_random_uuid();
begin
 changed:=finance_set_salary(uid,req,'work:northlight','kendra',700000);
 if not exists(select 1 from finance_salary_notices where user_id=uid and character_key='kendra'
   and asset_key='work:northlight' and new_salary_cents=700000)
 then raise exception 'employee did not receive private pay notice'; end if;
 if exists(select 1 from finance_salary_notices where user_id=uid and character_key='riley')
 then raise exception 'salary notice leaked to another character'; end if;
 changed:=finance_set_salary(uid,req,'work:northlight','kendra',700000);
 if (select count(*) from finance_salary_notices where user_id=uid and request_id=req)<>1
 then raise exception 'duplicate employee notice'; end if;
end $$;
