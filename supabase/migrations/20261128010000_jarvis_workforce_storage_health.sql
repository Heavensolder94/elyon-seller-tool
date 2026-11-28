-- Read-only storage and retention inventory. No deletion, archive or billing changes.
create or replace function public.jarvis_workforce_storage_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'databaseBytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'taskTableBytes', pg_catalog.pg_total_relation_size('public.jarvis_tasks'::regclass),
    'runTableBytes', pg_catalog.pg_total_relation_size('public.jarvis_agent_runs'::regclass),
    'retentionDays', 90,
    'archiveCandidates', (
      select count(*) from public.jarvis_tasks t
      where t.type = 'workforce-agent-execution'
        and t.status in ('completed', 'failed', 'cancelled')
        and t.finished_at < pg_catalog.now() - interval '90 days'
        and t.payload->>'version' = '1'
    )
  );
$$;
revoke all on function public.jarvis_workforce_storage_health() from public, anon, authenticated;
grant execute on function public.jarvis_workforce_storage_health() to service_role;
