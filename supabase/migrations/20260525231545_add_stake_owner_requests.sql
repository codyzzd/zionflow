create table if not exists public.stake_owner_requests (
  id uuid primary key,
  stake_id uuid not null references public.stakes(id) on delete cascade,
  ward_id uuid not null references public.wards(id) on delete cascade,
  requester_user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'cancelled', 'invalidated')),
  approvals jsonb not null default '[]'::jsonb,
  approved_at timestamptz,
  resolved_at timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists stake_owner_requests_stake_id_idx
  on public.stake_owner_requests(stake_id);

create index if not exists stake_owner_requests_requester_user_id_idx
  on public.stake_owner_requests(requester_user_id);

create unique index if not exists stake_owner_requests_one_pending_per_user_stake_idx
  on public.stake_owner_requests(stake_id, requester_user_id)
  where status = 'pending' and archived_at is null;

alter table public.stake_owner_requests enable row level security;

grant select, insert, update, delete on table public.stake_owner_requests to authenticated;

create policy "Authenticated users can read stake owner requests"
  on public.stake_owner_requests
  for select
  to authenticated
  using (true);

create policy "Authenticated users can insert stake owner requests"
  on public.stake_owner_requests
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update stake owner requests"
  on public.stake_owner_requests
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete stake owner requests"
  on public.stake_owner_requests
  for delete
  to authenticated
  using (true);
