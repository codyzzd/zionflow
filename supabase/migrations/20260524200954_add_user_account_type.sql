alter table public.users add column if not exists account_type text not null default 'regular';

update public.users
set account_type = 'regular'
where account_type is null
  or account_type not in ('regular', 'system_super_user');

update public.users
set account_type = 'system_super_user'
where lower(email) = 'codyzzd@gmail.com';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_account_type_check') then
    alter table public.users
      add constraint users_account_type_check check (account_type in ('regular', 'system_super_user'));
  end if;
end $$;
