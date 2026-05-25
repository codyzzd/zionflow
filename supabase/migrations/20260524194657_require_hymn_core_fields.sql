alter table public.hymns
  alter column number set not null,
  alter column title set not null,
  alter column hymn_book_id set not null;

alter table public.hymns
  drop constraint if exists hymns_number_not_blank_check;

alter table public.hymns
  add constraint hymns_number_not_blank_check
  check (btrim(number) <> '');

alter table public.hymns
  drop constraint if exists hymns_title_not_blank_check;

alter table public.hymns
  add constraint hymns_title_not_blank_check
  check (btrim(title) <> '');

comment on column public.hymns.number is 'Required alphanumeric hymn number in the selected hymn book, such as 101, 108a, or 108b.';
comment on column public.hymns.title is 'Required hymn title shown in the catalog and minutes selectors.';
comment on column public.hymns.hymn_book_id is 'Required hymn book that owns this hymn number.';
