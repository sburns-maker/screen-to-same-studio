-- Deploy after the app code; adding this row makes Riley discoverable in the inbox.
insert into public.characters(key,full_name,preferred_name,age,pronouns,zip,enabled,sort_order,avatar_key)
values ('riley','Riley Hart','Riley',28,'she/her','16602',true,6,'riley')
on conflict (key) do update set enabled=true,preferred_name=excluded.preferred_name,full_name=excluded.full_name;
