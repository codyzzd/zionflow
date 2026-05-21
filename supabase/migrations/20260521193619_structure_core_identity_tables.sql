alter table public.stakes add column if not exists name text;

update public.stakes
set name = coalesce(nullif(name, ''), nullif(data->>'name', ''), '')
where name is null or name = '';

alter table public.stakes alter column name set default '';
alter table public.stakes alter column name set not null;

alter table public.wards add column if not exists name text;
alter table public.wards add column if not exists city text;
alter table public.wards add column if not exists state text;
alter table public.wards add column if not exists meeting_time text;
alter table public.wards add column if not exists bishopric jsonb;
alter table public.wards add column if not exists summary text;

update public.wards
set
  stake_id = coalesce(nullif(stake_id, ''), nullif(data->>'stakeId', '')),
  name = coalesce(nullif(name, ''), nullif(data->>'name', ''), ''),
  city = coalesce(city, data->>'city', ''),
  state = coalesce(state, data->>'state', ''),
  meeting_time = coalesce(meeting_time, data->>'meetingTime', ''),
  bishopric = coalesce(bishopric, data->'bishopric', '[]'::jsonb),
  summary = coalesce(summary, data->>'summary', '')
where true;

alter table public.wards alter column name set default '';
alter table public.wards alter column city set default '';
alter table public.wards alter column state set default '';
alter table public.wards alter column meeting_time set default '';
alter table public.wards alter column bishopric set default '[]'::jsonb;
alter table public.wards alter column summary set default '';
alter table public.wards alter column name set not null;
alter table public.wards alter column city set not null;
alter table public.wards alter column state set not null;
alter table public.wards alter column meeting_time set not null;
alter table public.wards alter column bishopric set not null;
alter table public.wards alter column summary set not null;

alter table public.roles add column if not exists name text;
alter table public.roles add column if not exists description text;
alter table public.roles add column if not exists permissions jsonb;

update public.roles
set
  name = coalesce(nullif(name, ''), nullif(data->>'name', ''), ''),
  description = coalesce(description, data->>'description', ''),
  permissions = coalesce(permissions, data->'permissions', '[]'::jsonb)
where true;

alter table public.roles alter column name set default '';
alter table public.roles alter column description set default '';
alter table public.roles alter column permissions set default '[]'::jsonb;
alter table public.roles alter column name set not null;
alter table public.roles alter column description set not null;
alter table public.roles alter column permissions set not null;

alter table public.users add column if not exists auth_user_id uuid;
alter table public.users add column if not exists name text;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists phone text;
alter table public.users add column if not exists status text;
alter table public.users add column if not exists permission_overrides jsonb;
alter table public.users add column if not exists permissions_configured boolean;
alter table public.users add column if not exists last_access_at timestamp with time zone;
alter table public.users add column if not exists created_by_user_id text;
alter table public.users add column if not exists updated_by_user_id text;
alter table public.users add column if not exists archived_at timestamp with time zone;
alter table public.users add column if not exists archived_by_user_id text;

update public.users
set
  auth_user_id = coalesce(auth_user_id, nullif(data->>'authUserId', '')::uuid),
  ward_id = coalesce(nullif(ward_id, ''), nullif(data->>'wardId', '')),
  member_id = coalesce(nullif(member_id, ''), nullif(data->>'memberId', '')),
  role_id = coalesce(nullif(role_id, ''), nullif(data->>'roleId', '')),
  name = coalesce(nullif(name, ''), nullif(data->>'name', ''), ''),
  email = coalesce(nullif(email, ''), nullif(data->>'email', ''), ''),
  phone = coalesce(phone, data->>'phone', ''),
  status = coalesce(nullif(status, ''), nullif(data->>'status', ''), 'active'),
  permission_overrides = coalesce(permission_overrides, data->'permissionOverrides', '[]'::jsonb),
  permissions_configured = coalesce(permissions_configured, (data->>'permissionsConfigured')::boolean, true),
  created_at = coalesce(nullif(data->>'createdAt', '')::timestamp with time zone, created_at),
  updated_at = coalesce(nullif(data->>'updatedAt', '')::timestamp with time zone, updated_at),
  last_access_at = coalesce(last_access_at, nullif(data->>'lastAccessAt', '')::timestamp with time zone),
  created_by_user_id = coalesce(nullif(created_by_user_id, ''), nullif(data->>'createdByUserId', '')),
  updated_by_user_id = coalesce(nullif(updated_by_user_id, ''), nullif(data->>'updatedByUserId', '')),
  archived_at = coalesce(archived_at, nullif(data->>'archivedAt', '')::timestamp with time zone),
  archived_by_user_id = coalesce(nullif(archived_by_user_id, ''), nullif(data->>'archivedByUserId', ''))
where true;

alter table public.users alter column name set default '';
alter table public.users alter column email set default '';
alter table public.users alter column phone set default '';
alter table public.users alter column status set default 'active';
alter table public.users alter column permission_overrides set default '[]'::jsonb;
alter table public.users alter column permissions_configured set default true;
alter table public.users alter column name set not null;
alter table public.users alter column email set not null;
alter table public.users alter column phone set not null;
alter table public.users alter column status set not null;
alter table public.users alter column permission_overrides set not null;
alter table public.users alter column permissions_configured set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_auth_user_id_fkey') then
    alter table public.users add constraint users_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'users_status_check') then
    alter table public.users add constraint users_status_check check (status in ('active', 'inactive'));
  end if;
end $$;

create unique index if not exists users_auth_user_id_key on public.users(auth_user_id) where auth_user_id is not null;
create index if not exists users_email_idx on public.users(email);
create index if not exists users_status_idx on public.users(status);
create index if not exists users_archived_at_idx on public.users(archived_at);

alter table public.stakes drop column if exists data;
alter table public.wards drop column if exists data;
alter table public.roles drop column if exists data;
alter table public.users drop column if exists data;
