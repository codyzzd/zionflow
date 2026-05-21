alter table public.hymns add column if not exists number text;
alter table public.hymns add column if not exists title text;
alter table public.hymns add column if not exists active boolean not null default true;

update public.hymns
set
  number = coalesce(number, data->>'number'),
  title = coalesce(title, data->>'title'),
  active = coalesce((data->>'active')::boolean, true)
where number is null or title is null;

create unique index if not exists hymns_number_key on public.hymns(number);
create index if not exists hymns_active_idx on public.hymns(active);

comment on table public.hymns is 'Global hymns catalog shared by every stake and ward. Managed by future system super admin access, not by local ward or stake users.';
comment on column public.hymns.number is 'Official hymn number in the global catalog.';
comment on column public.hymns.title is 'Official hymn title in the global catalog.';
comment on column public.hymns.active is 'Controls whether the hymn appears as selectable in minutes.';
