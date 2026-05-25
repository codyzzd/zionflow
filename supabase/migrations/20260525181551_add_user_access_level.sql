alter table public.users add column if not exists access_level text;

update public.users
set access_level = coalesce(
  nullif(access_level, ''),
  case
    when role_id::text = '00000000-0000-4000-8000-000000000101'
      and ward_id is not null then 'stake_owner'
    when role_id::text in (
      '00000000-0000-4000-8000-000000000102',
      'role_admin',
      'role_bishopric'
    ) then 'ward_owner'
    else 'member'
  end
)
where access_level is null
  or access_level = ''
  or access_level not in ('stake_owner', 'stake_leader', 'ward_owner', 'ward_leader', 'member');

with ranked_ward_owners as (
  select
    id,
    row_number() over (
      partition by ward_id
      order by created_at asc nulls last, id asc
    ) as owner_rank
  from public.users
  where access_level = 'ward_owner'
    and status = 'active'
    and archived_at is null
    and ward_id is not null
)
update public.users
set access_level = 'member'
from ranked_ward_owners
where public.users.id = ranked_ward_owners.id
  and ranked_ward_owners.owner_rank > 1;

alter table public.users alter column access_level set default 'member';
alter table public.users alter column access_level set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_access_level_check') then
    alter table public.users
      add constraint users_access_level_check
      check (access_level in ('stake_owner', 'stake_leader', 'ward_owner', 'ward_leader', 'member'));
  end if;
end $$;

create unique index if not exists users_one_active_ward_owner_per_ward_idx
on public.users(ward_id)
where access_level = 'ward_owner'
  and status = 'active'
  and archived_at is null
  and ward_id is not null;
