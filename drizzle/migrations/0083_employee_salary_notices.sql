-- Explicit workplace pay notices are character-specific, never world-wide.
create table if not exists public.finance_salary_notices (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 character_key text not null,
 asset_key text not null,
 old_salary_cents bigint not null,
 new_salary_cents bigint not null,
 notified_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
create index if not exists finance_salary_notices_character_idx
 on public.finance_salary_notices(user_id,character_key,notified_at desc);
alter table public.finance_salary_notices enable row level security;
revoke all on public.finance_salary_notices from anon,authenticated;
grant select,insert,update,delete on public.finance_salary_notices to service_role;

create or replace function public.finance_set_salary(p_user uuid,p_request uuid,p_asset text,p_worker text,p_salary bigint)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare a finance_accounts%rowtype;w finance_workers%rowtype;
begin
 if p_salary<0 or p_salary>50000000000 then raise exception 'Salary out of bounds'; end if;
 perform finance_initialize(p_user);
 select * into a from finance_accounts where user_id=p_user for update;
 if exists(select 1 from finance_ledger where user_id=p_user and request_id=p_request)
   then return finance_snapshot(p_user); end if;
 if not exists(select 1 from finance_assets where user_id=p_user and asset_key=p_asset and owned)
   then raise exception 'Business ownership required'; end if;
 select * into w from finance_workers where user_id=p_user and asset_key=p_asset
   and worker_key=p_worker and active=true for update;
 if not found then raise exception 'Unknown active employee'; end if;
 update finance_workers set salary_cents=p_salary where user_id=p_user and asset_key=p_asset
   and worker_key=p_worker;
 if w.character_key is not null and w.salary_cents<>p_salary then
   insert into finance_salary_notices(user_id,request_id,character_key,asset_key,old_salary_cents,new_salary_cents)
   values(p_user,p_request,w.character_key,p_asset,w.salary_cents,p_salary);
 end if;
 insert into finance_ledger(user_id,request_id,event_type,asset_key,amount_cents,cash_after_cents,note)
 values(p_user,p_request,'salary_change',p_asset,0,a.cash_cents,
    'Virtual pay adjustment for '||p_worker);
 return finance_snapshot(p_user);
end $$;
revoke all on function public.finance_set_salary(uuid,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.finance_set_salary(uuid,uuid,text,text,bigint) to service_role;
