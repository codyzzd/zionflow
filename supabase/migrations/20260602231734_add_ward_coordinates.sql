alter table public.wards add column if not exists address text;
alter table public.wards add column if not exists latitude double precision;
alter table public.wards add column if not exists longitude double precision;
