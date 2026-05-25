alter table public.hymns
  add column if not exists category text;

comment on column public.hymns.category is 'Optional hymn category used to group or classify hymns in the catalog.';
