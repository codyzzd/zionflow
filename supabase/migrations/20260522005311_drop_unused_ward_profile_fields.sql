alter table public.wards
  drop column if exists meeting_time,
  drop column if exists bishopric,
  drop column if exists summary;
