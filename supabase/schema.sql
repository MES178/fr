create table if not exists public.habit_tracker_data (
  id text primary key,
  entries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.habit_tracker_data enable row level security;

drop policy if exists "French tracker read" on public.habit_tracker_data;
drop policy if exists "French tracker insert" on public.habit_tracker_data;
drop policy if exists "French tracker update" on public.habit_tracker_data;
drop policy if exists "French tracker authenticated read" on public.habit_tracker_data;
drop policy if exists "French tracker authenticated insert" on public.habit_tracker_data;
drop policy if exists "French tracker authenticated update" on public.habit_tracker_data;

create policy "French tracker authenticated read"
on public.habit_tracker_data
for select
to authenticated
using (id = auth.uid()::text);

create policy "French tracker authenticated insert"
on public.habit_tracker_data
for insert
to authenticated
with check (id = auth.uid()::text);

create policy "French tracker authenticated update"
on public.habit_tracker_data
for update
to authenticated
using (id = auth.uid()::text)
with check (id = auth.uid()::text);
