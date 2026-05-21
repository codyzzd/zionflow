create table if not exists public.superala_app_state (
  id text primary key,
  data jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create or replace function public.set_superala_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_superala_app_state_updated_at on public.superala_app_state;

create trigger set_superala_app_state_updated_at
before update on public.superala_app_state
for each row
execute function public.set_superala_updated_at();

alter table public.superala_app_state enable row level security;

drop policy if exists "superala_app_state_read" on public.superala_app_state;
drop policy if exists "superala_app_state_insert" on public.superala_app_state;
drop policy if exists "superala_app_state_update" on public.superala_app_state;

create policy "superala_app_state_read"
on public.superala_app_state
for select
to anon, authenticated
using (id = 'default');

create policy "superala_app_state_insert"
on public.superala_app_state
for insert
to anon, authenticated
with check (id = 'default');

create policy "superala_app_state_update"
on public.superala_app_state
for update
to anon, authenticated
using (id = 'default')
with check (id = 'default');

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.superala_app_state to anon, authenticated;
