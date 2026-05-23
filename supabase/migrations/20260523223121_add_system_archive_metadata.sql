alter table public.stakes
  add column if not exists created_by_user_id uuid,
  add column if not exists updated_by_user_id uuid,
  add column if not exists archived_at timestamp with time zone,
  add column if not exists archived_by_user_id uuid;

alter table public.wards
  add column if not exists created_by_user_id uuid,
  add column if not exists updated_by_user_id uuid,
  add column if not exists archived_at timestamp with time zone,
  add column if not exists archived_by_user_id uuid;

create index if not exists stakes_archived_at_idx on public.stakes(archived_at);
create index if not exists wards_archived_at_idx on public.wards(archived_at);
