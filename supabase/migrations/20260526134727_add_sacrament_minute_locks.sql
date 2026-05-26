alter table public.sacrament_minutes
  add column if not exists locked_by uuid references public.users(id) on update cascade on delete set null,
  add column if not exists locked_at timestamp with time zone,
  add column if not exists lock_expires_at timestamp with time zone,
  add column if not exists version integer not null default 1;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sacrament_minutes'
  ) then
    alter publication supabase_realtime drop table public.sacrament_minutes;
  end if;
end $$;

update public.sacrament_minutes
set version = greatest(1, coalesce((data->>'version')::integer, version, 1))
where data ? 'version'
  and (data->>'version') ~ '^[0-9]+$';

create index if not exists sacrament_minutes_lock_expires_at_idx on public.sacrament_minutes(lock_expires_at);

create or replace function public.acquire_sacrament_minute_lock(
  p_minute_id uuid,
  p_user_id uuid,
  p_ttl_seconds integer default 120
)
returns table(
  acquired boolean,
  minute_id uuid,
  locked_by uuid,
  locked_by_name text,
  locked_at timestamp with time zone,
  lock_expires_at timestamp with time zone,
  version integer,
  updated_at timestamp with time zone
)
language plpgsql
set search_path = public
as $$
begin
  return query
  with updated as (
    update public.sacrament_minutes sm
    set
      locked_by = p_user_id,
      locked_at = case when sm.locked_by = p_user_id then coalesce(sm.locked_at, now()) else now() end,
      lock_expires_at = now() + make_interval(secs => greatest(30, p_ttl_seconds)),
      data = jsonb_set(
        jsonb_set(
          jsonb_set(sm.data, '{lockedByUserId}', to_jsonb(p_user_id::text), true),
          '{lockedAt}',
          to_jsonb(case when sm.locked_by = p_user_id then coalesce(sm.locked_at, now()) else now() end),
          true
        ),
        '{lockExpiresAt}',
        to_jsonb(now() + make_interval(secs => greatest(30, p_ttl_seconds))),
        true
      )
    where sm.id = p_minute_id
      and (sm.locked_by is null or sm.locked_by = p_user_id or sm.lock_expires_at <= now())
    returning sm.*
  ),
  current_row as (
    select true as acquired, updated.* from updated
    union all
    select false as acquired, sm.*
    from public.sacrament_minutes sm
    where sm.id = p_minute_id
      and not exists (select 1 from updated)
  )
  select
    current_row.acquired,
    current_row.id,
    current_row.locked_by,
    users.name,
    current_row.locked_at,
    current_row.lock_expires_at,
    current_row.version,
    current_row.updated_at
  from current_row
  left join public.users on users.id = current_row.locked_by;
end;
$$;

create or replace function public.renew_sacrament_minute_lock(
  p_minute_id uuid,
  p_user_id uuid,
  p_ttl_seconds integer default 120
)
returns table(
  renewed boolean,
  minute_id uuid,
  locked_by uuid,
  locked_by_name text,
  locked_at timestamp with time zone,
  lock_expires_at timestamp with time zone,
  version integer,
  updated_at timestamp with time zone
)
language plpgsql
set search_path = public
as $$
begin
  return query
  with updated as (
    update public.sacrament_minutes sm
    set
      lock_expires_at = now() + make_interval(secs => greatest(30, p_ttl_seconds)),
      data = jsonb_set(sm.data, '{lockExpiresAt}', to_jsonb(now() + make_interval(secs => greatest(30, p_ttl_seconds))), true)
    where sm.id = p_minute_id
      and sm.locked_by = p_user_id
      and sm.lock_expires_at > now()
    returning sm.*
  ),
  current_row as (
    select true as renewed, updated.* from updated
    union all
    select false as renewed, sm.*
    from public.sacrament_minutes sm
    where sm.id = p_minute_id
      and not exists (select 1 from updated)
  )
  select
    current_row.renewed,
    current_row.id,
    current_row.locked_by,
    users.name,
    current_row.locked_at,
    current_row.lock_expires_at,
    current_row.version,
    current_row.updated_at
  from current_row
  left join public.users on users.id = current_row.locked_by;
end;
$$;

create or replace function public.release_sacrament_minute_lock(
  p_minute_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  update public.sacrament_minutes sm
  set
    locked_by = null,
    locked_at = null,
    lock_expires_at = null,
    data = sm.data - 'lockedByUserId' - 'lockedAt' - 'lockExpiresAt'
  where sm.id = p_minute_id
    and sm.locked_by = p_user_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.save_sacrament_minute_with_lock(
  p_minute_id uuid,
  p_user_id uuid,
  p_expected_version integer,
  p_data jsonb,
  p_ward_id uuid,
  p_responsible_user_id uuid
)
returns table(
  saved boolean,
  reason text,
  minute_id uuid,
  version integer,
  data jsonb,
  updated_at timestamp with time zone
)
language plpgsql
set search_path = public
as $$
declare
  v_current public.sacrament_minutes%rowtype;
  v_next_version integer;
  v_saved public.sacrament_minutes%rowtype;
  v_now timestamp with time zone := now();
begin
  select *
  into v_current
  from public.sacrament_minutes sm
  where sm.id = p_minute_id
  for update;

  if not found then
    return query select false, 'not_found', p_minute_id, null::integer, null::jsonb, null::timestamp with time zone;
    return;
  end if;

  if v_current.locked_by is distinct from p_user_id or v_current.lock_expires_at <= v_now then
    return query select false, 'lock_lost', v_current.id, v_current.version, v_current.data, v_current.updated_at;
    return;
  end if;

  if v_current.version <> p_expected_version then
    return query select false, 'version_conflict', v_current.id, v_current.version, v_current.data, v_current.updated_at;
    return;
  end if;

  v_next_version := v_current.version + 1;

  update public.sacrament_minutes sm
  set
    data = (p_data || jsonb_build_object(
      'version', v_next_version,
      'updatedAt', v_now,
      'updatedByUserId', p_user_id::text
    )) - 'lockedByUserId' - 'lockedAt' - 'lockExpiresAt',
    ward_id = p_ward_id,
    responsible_user_id = p_responsible_user_id,
    locked_by = null,
    locked_at = null,
    lock_expires_at = null,
    version = v_next_version
  where sm.id = p_minute_id
  returning *
  into v_saved;

  insert into public.minute_versions (id, data, minute_id)
  values (
    gen_random_uuid(),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'minuteId', p_minute_id::text,
      'createdAt', v_now,
      'createdBy', p_user_id::text,
      'snapshot', p_data->'form',
      'status', coalesce(p_data->>'status', 'draft'),
      'version', v_next_version
    ),
    p_minute_id
  );

  return query select true, null::text, v_saved.id, v_saved.version, v_saved.data, v_saved.updated_at;
end;
$$;

grant execute on function public.acquire_sacrament_minute_lock(uuid, uuid, integer) to anon, authenticated;
grant execute on function public.renew_sacrament_minute_lock(uuid, uuid, integer) to anon, authenticated;
grant execute on function public.release_sacrament_minute_lock(uuid, uuid) to anon, authenticated;
grant execute on function public.save_sacrament_minute_with_lock(uuid, uuid, integer, jsonb, uuid, uuid) to anon, authenticated;
