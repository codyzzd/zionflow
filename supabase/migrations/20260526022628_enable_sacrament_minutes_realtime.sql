do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sacrament_minutes'
  ) then
    alter publication supabase_realtime add table public.sacrament_minutes;
  end if;
end $$;
