alter table public.wards
add column if not exists frequency_goal integer;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wards'
      and column_name = 'data'
  ) then
    update public.wards
    set frequency_goal = nullif(data->>'frequencyGoal', '')::integer
    where frequency_goal is null
      and data ? 'frequencyGoal'
      and nullif(data->>'frequencyGoal', '') is not null
      and data->>'frequencyGoal' ~ '^[0-9]+$'
      and (data->>'frequencyGoal')::integer between 1 and 999;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wards_frequency_goal_check'
  ) then
    alter table public.wards
    add constraint wards_frequency_goal_check
    check (frequency_goal is null or (frequency_goal >= 1 and frequency_goal <= 999));
  end if;
end $$;
