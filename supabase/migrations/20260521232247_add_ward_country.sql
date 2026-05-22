alter table public.wards add column if not exists country text;

update public.wards
set country = coalesce(nullif(country, ''), 'Brasil')
where country is null or country = '';

alter table public.wards alter column country set default 'Brasil';
alter table public.wards alter column country set not null;

insert into public.stakes (id, name)
values ('00000000-0000-4000-8000-000000000201', 'Estaca DEMO')
on conflict (id) do nothing;

insert into public.wards (id, stake_id, name, city, state, country, meeting_time, bishopric, summary)
values (
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000201',
  'Ala DEMO',
  'Fortaleza',
  'CE',
  'Brasil',
  '',
  '[]'::jsonb,
  'Ala de demonstração para testar entrada no sistema.'
)
on conflict (id) do nothing;
