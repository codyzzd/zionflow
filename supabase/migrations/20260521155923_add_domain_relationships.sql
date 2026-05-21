alter table public.wards add column if not exists stake_id text;

alter table public.users add column if not exists ward_id text;
alter table public.users add column if not exists member_id text;
alter table public.users add column if not exists role_id text;

alter table public.members add column if not exists ward_id text;

alter table public.member_notes add column if not exists member_id text;

alter table public.sacrament_minutes add column if not exists ward_id text;
alter table public.sacrament_minutes add column if not exists responsible_user_id text;

alter table public.minute_versions add column if not exists minute_id text;

alter table public.missionary_companionships add column if not exists ward_id text;

alter table public.host_houses add column if not exists ward_id text;
alter table public.host_houses add column if not exists host_member_id text;

alter table public.lunch_schedules add column if not exists ward_id text;
alter table public.lunch_schedules add column if not exists host_member_id text;

alter table public.caravans add column if not exists ward_id text;

alter table public.caravan_people add column if not exists ward_id text;
alter table public.caravan_people add column if not exists home_ward_id text;
alter table public.caravan_people add column if not exists document_type_id text;

alter table public.caravan_registrations add column if not exists ward_id text;
alter table public.caravan_registrations add column if not exists caravan_id text;
alter table public.caravan_registrations add column if not exists person_id text;

alter table public.patrol_members add column if not exists ward_id text;
alter table public.patrol_members add column if not exists member_id text;

alter table public.patrol_schedules add column if not exists ward_id text;
alter table public.patrol_schedules add column if not exists primary_patrol_member_id text;
alter table public.patrol_schedules add column if not exists secondary_patrol_member_id text;
alter table public.patrol_schedules add column if not exists original_primary_patrol_member_id text;

alter table public.audit_logs add column if not exists ward_id text;
alter table public.audit_logs add column if not exists actor_user_id text;

update public.wards set stake_id = data->>'stakeId' where stake_id is null;
update public.users set ward_id = data->>'wardId', member_id = nullif(data->>'memberId', ''), role_id = data->>'roleId' where ward_id is null or role_id is null;
update public.members set ward_id = data->>'wardId' where ward_id is null;
update public.member_notes set member_id = data->>'memberId' where member_id is null;
update public.sacrament_minutes set ward_id = data->>'wardId', responsible_user_id = data->>'responsibleUserId' where ward_id is null or responsible_user_id is null;
update public.minute_versions set minute_id = data->>'minuteId' where minute_id is null;
update public.missionary_companionships set ward_id = data->>'wardId' where ward_id is null;
update public.host_houses set ward_id = data->>'wardId', host_member_id = nullif(data->>'hostMemberId', '') where ward_id is null;
update public.lunch_schedules set ward_id = data->>'wardId', host_member_id = nullif(data->>'hostMemberId', '') where ward_id is null;
update public.caravans set ward_id = data->>'wardId' where ward_id is null;
update public.caravan_people set ward_id = data->>'wardId', home_ward_id = data->>'homeWardId', document_type_id = nullif(data->>'documentTypeId', '') where ward_id is null;
update public.caravan_registrations set ward_id = data->>'wardId', caravan_id = data->>'caravanId', person_id = data->>'personId' where ward_id is null;
update public.patrol_members set ward_id = data->>'wardId', member_id = nullif(data->>'memberId', '') where ward_id is null;
update public.patrol_schedules
set
  ward_id = data->>'wardId',
  primary_patrol_member_id = nullif(data->>'primaryPatrolMemberId', ''),
  secondary_patrol_member_id = nullif(data->>'secondaryPatrolMemberId', ''),
  original_primary_patrol_member_id = nullif(data->>'originalPrimaryPatrolMemberId', '')
where ward_id is null;
update public.audit_logs set ward_id = data->>'wardId', actor_user_id = data->>'actorUserId' where ward_id is null;

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

create index if not exists wards_stake_id_idx on public.wards(stake_id);
create index if not exists users_ward_id_idx on public.users(ward_id);
create index if not exists users_member_id_idx on public.users(member_id);
create index if not exists users_role_id_idx on public.users(role_id);
create index if not exists members_ward_id_idx on public.members(ward_id);
create index if not exists member_notes_member_id_idx on public.member_notes(member_id);
create index if not exists sacrament_minutes_ward_id_idx on public.sacrament_minutes(ward_id);
create index if not exists minute_versions_minute_id_idx on public.minute_versions(minute_id);
create index if not exists missionary_companionships_ward_id_idx on public.missionary_companionships(ward_id);
create index if not exists host_houses_ward_id_idx on public.host_houses(ward_id);
create index if not exists lunch_schedules_ward_id_idx on public.lunch_schedules(ward_id);
create index if not exists caravans_ward_id_idx on public.caravans(ward_id);
create index if not exists caravan_people_ward_id_idx on public.caravan_people(ward_id);
create index if not exists caravan_registrations_ward_id_idx on public.caravan_registrations(ward_id);
create index if not exists caravan_registrations_caravan_id_idx on public.caravan_registrations(caravan_id);
create index if not exists caravan_registrations_person_id_idx on public.caravan_registrations(person_id);
create index if not exists patrol_members_ward_id_idx on public.patrol_members(ward_id);
create index if not exists patrol_schedules_ward_id_idx on public.patrol_schedules(ward_id);
create index if not exists audit_logs_ward_id_idx on public.audit_logs(ward_id);
