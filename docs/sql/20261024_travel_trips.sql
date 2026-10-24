-- Apply once to the same production Supabase project used by the app.
create table if not exists public.travel_trips (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null,
 origin text not null,
 destination text not null,
 mode text not null check(mode in ('road_trip','flight','rail','local')),
 purpose text not null check(purpose in ('vacation','work','family','adventure')),
 start_date date,
 end_date date,
 status text not null default 'idea' check(status in ('idea','proposed','accepted','in_progress','completed','cancelled')),
 companions jsonb not null default '[]'::jsonb,
 itinerary jsonb not null default '[]'::jsonb,
 notes jsonb not null default '[]'::jsonb,
 revision integer not null default 0,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 constraint valid_travel_dates check(end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists travel_trips_user_idx on public.travel_trips(user_id, updated_at desc);
alter table public.travel_trips enable row level security;
drop policy if exists travel_trips_owner on public.travel_trips;
create policy travel_trips_owner on public.travel_trips for all to authenticated
 using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create table if not exists public.travel_trip_moments (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.travel_trips(id) on delete cascade,
 stop_id text not null,
 day integer not null check(day>0),
 body text not null,
 created_at timestamptz not null default now()
);
create index if not exists travel_trip_moments_owner_idx on public.travel_trip_moments(user_id,trip_id,created_at);
alter table public.travel_trip_moments enable row level security;
drop policy if exists travel_trip_moments_owner on public.travel_trip_moments;
create policy travel_trip_moments_owner on public.travel_trip_moments for all to authenticated
 using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
