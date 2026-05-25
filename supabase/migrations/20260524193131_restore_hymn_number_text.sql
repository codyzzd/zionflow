drop index if exists public.hymns_hymn_book_number_key;
drop index if exists public.hymns_number_key;

alter table public.hymns
  alter column number type text
  using lower(regexp_replace(number::text, '[^0-9A-Za-z]', '', 'g'));

update public.hymns
set number = null
where number = '';

alter table public.hymns
  drop constraint if exists hymns_number_alphanumeric_check;

alter table public.hymns
  add constraint hymns_number_alphanumeric_check
  check (number is null or number ~ '^[0-9A-Za-z]+$');

create unique index if not exists hymns_hymn_book_number_key on public.hymns(hymn_book_id, number);

comment on column public.hymns.number is 'Official alphanumeric hymn number in the selected hymn book, such as 101, 108a, or 108b.';
