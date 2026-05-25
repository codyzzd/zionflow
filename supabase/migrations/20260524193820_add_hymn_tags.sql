alter table public.hymns
  add column if not exists tags text[] not null default '{}';

update public.hymns
set tags = coalesce(tags, '{}')
where tags is null;

comment on column public.hymns.tags is 'Searchable tags associated with this hymn, such as faith, family, home, or plan of salvation.';
