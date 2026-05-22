alter table public.stakes
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists country text not null default 'Brasil';
