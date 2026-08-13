alter table public.jarvis_tasks
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists idempotency_key text,
  add column if not exists last_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jarvis_tasks_attempt_count_check'
      and conrelid = 'public.jarvis_tasks'::regclass
  ) then
    alter table public.jarvis_tasks
      add constraint jarvis_tasks_attempt_count_check
      check (attempt_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'jarvis_tasks_max_attempts_check'
      and conrelid = 'public.jarvis_tasks'::regclass
  ) then
    alter table public.jarvis_tasks
      add constraint jarvis_tasks_max_attempts_check
      check (max_attempts >= 1 and max_attempts <= 10);
  end if;
end
$$;

create index if not exists jarvis_tasks_idempotency_key_idx
  on public.jarvis_tasks (idempotency_key)
  where idempotency_key is not null;

create index if not exists jarvis_tasks_attempt_status_updated_at_idx
  on public.jarvis_tasks (attempt_count, status, updated_at desc);
