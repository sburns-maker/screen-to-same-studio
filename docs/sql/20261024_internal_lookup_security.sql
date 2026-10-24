-- Preserve service-only world installation access and signed-in phone lookup.
revoke all on public.interactive_world_installation from public, anon, authenticated;
grant all on public.interactive_world_installation to service_role;
alter table public.interactive_world_installation enable row level security;

revoke all on public.phone_contacts from public, anon, authenticated;
grant select on public.phone_contacts to authenticated;
grant all on public.phone_contacts to service_role;
alter table public.phone_contacts enable row level security;
create policy phone_contacts_signed_in_read on public.phone_contacts
for select to authenticated using (true);