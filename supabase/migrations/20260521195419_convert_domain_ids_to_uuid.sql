create extension if not exists pgcrypto;

truncate table
  public.audit_logs,
  public.patrol_schedules,
  public.patrol_members,
  public.caravan_registrations,
  public.caravan_people,
  public.caravans,
  public.lunch_schedules,
  public.host_houses,
  public.missionary_companionships,
  public.minute_versions,
  public.sacrament_minutes,
  public.member_notes,
  public.members,
  public.users,
  public.roles,
  public.wards,
  public.stakes,
  public.document_types,
  public.hymns
restart identity cascade;

do $$
declare
  constraint_record record;
  domain_tables text[] := array[
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
  for constraint_record in
    select format('%I.%I', constraint_namespace.nspname, constraint_table.relname) as table_name, pg_constraint.conname
    from pg_constraint
    join pg_class constraint_table on constraint_table.oid = pg_constraint.conrelid
    join pg_namespace constraint_namespace on constraint_namespace.oid = constraint_table.relnamespace
    where contype = 'f'
      and constraint_namespace.nspname = 'public'
      and constraint_table.relname = any(domain_tables)
  loop
    execute format('alter table %s drop constraint if exists %I', constraint_record.table_name, constraint_record.conname);
  end loop;
end $$;

do $$
declare
  column_record record;
begin
  for column_record in
    select *
    from (
      values
        ('stakes', 'id'),
        ('wards', 'id'),
        ('wards', 'stake_id'),
        ('roles', 'id'),
        ('users', 'id'),
        ('users', 'ward_id'),
        ('users', 'member_id'),
        ('users', 'role_id'),
        ('users', 'created_by_user_id'),
        ('users', 'updated_by_user_id'),
        ('users', 'archived_by_user_id'),
        ('members', 'id'),
        ('members', 'ward_id'),
        ('member_notes', 'id'),
        ('member_notes', 'member_id'),
        ('sacrament_minutes', 'id'),
        ('sacrament_minutes', 'ward_id'),
        ('sacrament_minutes', 'responsible_user_id'),
        ('minute_versions', 'id'),
        ('minute_versions', 'minute_id'),
        ('hymns', 'id'),
        ('missionary_companionships', 'id'),
        ('missionary_companionships', 'ward_id'),
        ('host_houses', 'id'),
        ('host_houses', 'ward_id'),
        ('host_houses', 'host_member_id'),
        ('lunch_schedules', 'id'),
        ('lunch_schedules', 'ward_id'),
        ('lunch_schedules', 'host_member_id'),
        ('caravans', 'id'),
        ('caravans', 'ward_id'),
        ('caravan_people', 'id'),
        ('caravan_people', 'ward_id'),
        ('caravan_people', 'home_ward_id'),
        ('caravan_people', 'document_type_id'),
        ('caravan_registrations', 'id'),
        ('caravan_registrations', 'ward_id'),
        ('caravan_registrations', 'caravan_id'),
        ('caravan_registrations', 'person_id'),
        ('document_types', 'id'),
        ('patrol_members', 'id'),
        ('patrol_members', 'ward_id'),
        ('patrol_members', 'member_id'),
        ('patrol_schedules', 'id'),
        ('patrol_schedules', 'ward_id'),
        ('patrol_schedules', 'primary_patrol_member_id'),
        ('patrol_schedules', 'secondary_patrol_member_id'),
        ('patrol_schedules', 'original_primary_patrol_member_id'),
        ('audit_logs', 'id'),
        ('audit_logs', 'ward_id'),
        ('audit_logs', 'actor_user_id')
    ) as columns(table_name, column_name)
  loop
    execute format('alter table public.%I alter column %I drop default', column_record.table_name, column_record.column_name);
    execute format(
      'alter table public.%I alter column %I type uuid using nullif(%I::text, '''')::uuid',
      column_record.table_name,
      column_record.column_name,
      column_record.column_name
    );

    if column_record.column_name = 'id' then
      execute format('alter table public.%I alter column id set default gen_random_uuid()', column_record.table_name);
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wards_stake_id_fkey') then
    alter table public.wards add constraint wards_stake_id_fkey foreign key (stake_id) references public.stakes(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'users_ward_id_fkey') then
    alter table public.users add constraint users_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'users_member_id_fkey') then
    alter table public.users add constraint users_member_id_fkey foreign key (member_id) references public.members(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'users_role_id_fkey') then
    alter table public.users add constraint users_role_id_fkey foreign key (role_id) references public.roles(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'users_auth_user_id_fkey') then
    alter table public.users add constraint users_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'users_created_by_user_id_fkey') then
    alter table public.users add constraint users_created_by_user_id_fkey foreign key (created_by_user_id) references public.users(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'users_updated_by_user_id_fkey') then
    alter table public.users add constraint users_updated_by_user_id_fkey foreign key (updated_by_user_id) references public.users(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'users_archived_by_user_id_fkey') then
    alter table public.users add constraint users_archived_by_user_id_fkey foreign key (archived_by_user_id) references public.users(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'members_ward_id_fkey') then
    alter table public.members add constraint members_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'member_notes_member_id_fkey') then
    alter table public.member_notes add constraint member_notes_member_id_fkey foreign key (member_id) references public.members(id) on update cascade on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sacrament_minutes_ward_id_fkey') then
    alter table public.sacrament_minutes add constraint sacrament_minutes_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sacrament_minutes_responsible_user_id_fkey') then
    alter table public.sacrament_minutes add constraint sacrament_minutes_responsible_user_id_fkey foreign key (responsible_user_id) references public.users(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'minute_versions_minute_id_fkey') then
    alter table public.minute_versions add constraint minute_versions_minute_id_fkey foreign key (minute_id) references public.sacrament_minutes(id) on update cascade on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'missionary_companionships_ward_id_fkey') then
    alter table public.missionary_companionships add constraint missionary_companionships_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'host_houses_ward_id_fkey') then
    alter table public.host_houses add constraint host_houses_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'host_houses_host_member_id_fkey') then
    alter table public.host_houses add constraint host_houses_host_member_id_fkey foreign key (host_member_id) references public.members(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lunch_schedules_ward_id_fkey') then
    alter table public.lunch_schedules add constraint lunch_schedules_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lunch_schedules_host_member_id_fkey') then
    alter table public.lunch_schedules add constraint lunch_schedules_host_member_id_fkey foreign key (host_member_id) references public.members(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'caravans_ward_id_fkey') then
    alter table public.caravans add constraint caravans_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'caravan_people_ward_id_fkey') then
    alter table public.caravan_people add constraint caravan_people_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'caravan_people_home_ward_id_fkey') then
    alter table public.caravan_people add constraint caravan_people_home_ward_id_fkey foreign key (home_ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'caravan_people_document_type_id_fkey') then
    alter table public.caravan_people add constraint caravan_people_document_type_id_fkey foreign key (document_type_id) references public.document_types(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'caravan_registrations_ward_id_fkey') then
    alter table public.caravan_registrations add constraint caravan_registrations_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'caravan_registrations_caravan_id_fkey') then
    alter table public.caravan_registrations add constraint caravan_registrations_caravan_id_fkey foreign key (caravan_id) references public.caravans(id) on update cascade on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'caravan_registrations_person_id_fkey') then
    alter table public.caravan_registrations add constraint caravan_registrations_person_id_fkey foreign key (person_id) references public.caravan_people(id) on update cascade on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'patrol_members_ward_id_fkey') then
    alter table public.patrol_members add constraint patrol_members_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'patrol_members_member_id_fkey') then
    alter table public.patrol_members add constraint patrol_members_member_id_fkey foreign key (member_id) references public.members(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'patrol_schedules_ward_id_fkey') then
    alter table public.patrol_schedules add constraint patrol_schedules_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'patrol_schedules_primary_patrol_member_id_fkey') then
    alter table public.patrol_schedules add constraint patrol_schedules_primary_patrol_member_id_fkey foreign key (primary_patrol_member_id) references public.patrol_members(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'patrol_schedules_secondary_patrol_member_id_fkey') then
    alter table public.patrol_schedules add constraint patrol_schedules_secondary_patrol_member_id_fkey foreign key (secondary_patrol_member_id) references public.patrol_members(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'patrol_schedules_original_primary_patrol_member_id_fkey') then
    alter table public.patrol_schedules add constraint patrol_schedules_original_primary_patrol_member_id_fkey foreign key (original_primary_patrol_member_id) references public.patrol_members(id) on update cascade on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'audit_logs_ward_id_fkey') then
    alter table public.audit_logs add constraint audit_logs_ward_id_fkey foreign key (ward_id) references public.wards(id) on update cascade on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'audit_logs_actor_user_id_fkey') then
    alter table public.audit_logs add constraint audit_logs_actor_user_id_fkey foreign key (actor_user_id) references public.users(id) on update cascade on delete set null;
  end if;
end $$;
