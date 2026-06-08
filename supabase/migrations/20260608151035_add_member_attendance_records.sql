create table if not exists public.member_attendance_records (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  ward_id uuid not null references public.wards(id) on update cascade on delete cascade,
  member_id uuid not null references public.members(id) on update cascade on delete cascade,
  date date not null,
  present boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint member_attendance_records_ward_member_date_key unique (ward_id, member_id, date)
);

create index if not exists member_attendance_records_ward_date_member_idx
on public.member_attendance_records (ward_id, date desc, member_id);

alter table public.member_attendance_records enable row level security;

drop trigger if exists set_member_attendance_records_updated_at on public.member_attendance_records;
create trigger set_member_attendance_records_updated_at
before update on public.member_attendance_records
for each row
execute function public.set_updated_at();

drop policy if exists member_attendance_records_select on public.member_attendance_records;
drop policy if exists member_attendance_records_insert on public.member_attendance_records;
drop policy if exists member_attendance_records_update on public.member_attendance_records;
drop policy if exists member_attendance_records_delete on public.member_attendance_records;

create policy member_attendance_records_select on public.member_attendance_records
for select to anon, authenticated
using (true);

create policy member_attendance_records_insert on public.member_attendance_records
for insert to anon, authenticated
with check (true);

create policy member_attendance_records_update on public.member_attendance_records
for update to anon, authenticated
using (true)
with check (true);

create policy member_attendance_records_delete on public.member_attendance_records
for delete to anon, authenticated
using (true);

grant select, insert, update, delete on public.member_attendance_records to anon, authenticated;
