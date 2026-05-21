create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
  table_names text[] := array[
    'stakes',
    'wards',
    'roles',
    'users',
    'members',
    'member_notes',
    'sacrament_minutes',
    'minute_versions',
    'hymns',
    'missionary_companionships',
    'host_houses',
    'lunch_schedules',
    'caravans',
    'caravan_people',
    'caravan_registrations',
    'document_types',
    'patrol_members',
    'patrol_schedules',
    'audit_logs'
  ];
begin
  foreach table_name in array table_names loop
    execute format(
      'create table if not exists public.%I (
        id text primary key,
        data jsonb not null default ''{}''::jsonb,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )',
      table_name
    );

    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at
      before update on public.%I
      for each row
      execute function public.set_updated_at()',
      table_name,
      table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete', table_name);

    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      table_name || '_select',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated with check (true)',
      table_name || '_insert',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to anon, authenticated using (true) with check (true)',
      table_name || '_update',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to anon, authenticated using (true)',
      table_name || '_delete',
      table_name
    );

    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', table_name);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;

drop table if exists public.superala_app_state;
drop function if exists public.set_superala_updated_at();
