create table if not exists public.hymn_books (
  id uuid primary key,
  data jsonb not null default '{}'::jsonb,
  name text not null,
  emoji text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.hymn_books enable row level security;

drop trigger if exists set_hymn_books_updated_at on public.hymn_books;
create trigger set_hymn_books_updated_at
before update on public.hymn_books
for each row
execute function public.set_updated_at();

drop policy if exists hymn_books_select on public.hymn_books;
drop policy if exists hymn_books_insert on public.hymn_books;
drop policy if exists hymn_books_update on public.hymn_books;
drop policy if exists hymn_books_delete on public.hymn_books;

create policy hymn_books_select on public.hymn_books for select to anon, authenticated using (true);
create policy hymn_books_insert on public.hymn_books for insert to anon, authenticated with check (true);
create policy hymn_books_update on public.hymn_books for update to anon, authenticated using (true) with check (true);
create policy hymn_books_delete on public.hymn_books for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.hymn_books to anon, authenticated;

insert into public.hymn_books (id, name, emoji)
values
  ('00000000-0000-4000-8000-000000000201', 'Antigo', '📜'),
  ('00000000-0000-4000-8000-000000000202', 'Novo', '📘'),
  ('00000000-0000-4000-8000-000000000203', 'Primária', '🌈')
on conflict (id) do update
set
  name = excluded.name,
  emoji = excluded.emoji;

alter table public.hymns add column if not exists hymn_book_id uuid;

update public.hymns
set hymn_book_id = coalesce(hymn_book_id, '00000000-0000-4000-8000-000000000202'::uuid)
where hymn_book_id is null;

alter table public.hymns
  alter column hymn_book_id set not null;

alter table public.hymns
  drop constraint if exists hymns_hymn_book_id_fkey;

alter table public.hymns
  add constraint hymns_hymn_book_id_fkey
  foreign key (hymn_book_id)
  references public.hymn_books(id)
  on update cascade
  on delete restrict;

drop index if exists public.hymns_number_key;
create unique index if not exists hymns_hymn_book_number_key on public.hymns(hymn_book_id, number);
create index if not exists hymns_hymn_book_id_idx on public.hymns(hymn_book_id);

comment on table public.hymn_books is 'Editable hymn book catalog used to group hymn numbers by source book.';
comment on column public.hymn_books.name is 'Display name of the hymn book, such as Antigo, Novo, or Primária.';
comment on column public.hymn_books.emoji is 'Short emoji marker shown next to the hymn book in system screens and hymn selectors.';
comment on column public.hymns.hymn_book_id is 'Hymn book that owns this hymn number.';
