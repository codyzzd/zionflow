alter table public.wards
add column if not exists lunch_p_day_weekday text not null default 'monday';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wards_lunch_p_day_weekday_check'
  ) then
    alter table public.wards
    add constraint wards_lunch_p_day_weekday_check
    check (lunch_p_day_weekday in ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'));
  end if;
end $$;
