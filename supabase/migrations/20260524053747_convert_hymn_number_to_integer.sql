update public.hymns
set number = null
where number is not null
  and number !~ '^\d+$';

drop index if exists public.hymns_hymn_book_number_key;
drop index if exists public.hymns_number_key;

alter table public.hymns
  alter column number type integer
  using number::integer;

create unique index if not exists hymns_hymn_book_number_key on public.hymns(hymn_book_id, number);

comment on column public.hymns.number is 'Official numeric hymn number in the selected hymn book.';
