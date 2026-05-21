create table if not exists public.habit_tracker_data (
  id text primary key,
  entries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.habit_tracker_data enable row level security;

-- Replace french-tracker-main with the same syncId used in js/cloud-config.js.
create policy "French tracker read"
on public.habit_tracker_data
for select
to anon
using (id = 'french-tracker-main');

create policy "French tracker insert"
on public.habit_tracker_data
for insert
to anon
with check (id = 'french-tracker-main');

create policy "French tracker update"
on public.habit_tracker_data
for update
to anon
using (id = 'french-tracker-main')
with check (id = 'french-tracker-main');
