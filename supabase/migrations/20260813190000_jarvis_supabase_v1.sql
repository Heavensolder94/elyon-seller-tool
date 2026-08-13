create extension if not exists pgcrypto;

create table if not exists public.jarvis_tasks (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  output jsonb,
  progress integer not null default 0
    check (progress >= 0 and progress <= 100),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists jarvis_tasks_status_updated_at_idx
  on public.jarvis_tasks (status, updated_at desc);

create index if not exists jarvis_tasks_type_created_at_idx
  on public.jarvis_tasks (type, created_at desc);

create index if not exists jarvis_tasks_created_at_idx
  on public.jarvis_tasks (created_at desc);

create table if not exists public.jarvis_agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.jarvis_tasks(id) on delete set null,
  agent_name text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  model text,
  cost numeric check (cost is null or cost >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists jarvis_agent_runs_task_id_idx
  on public.jarvis_agent_runs (task_id);

create index if not exists jarvis_agent_runs_agent_status_created_at_idx
  on public.jarvis_agent_runs (agent_name, status, created_at desc);

create index if not exists jarvis_agent_runs_created_at_idx
  on public.jarvis_agent_runs (created_at desc);

create table if not exists public.jarvis_memory (
  id uuid primary key default gen_random_uuid(),
  memory_type text not null,
  content jsonb not null default '{}'::jsonb,
  importance numeric not null default 0.5
    check (importance >= 0 and importance <= 1),
  confidence numeric not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jarvis_memory_type_importance_created_at_idx
  on public.jarvis_memory (memory_type, importance desc, created_at desc);

create index if not exists jarvis_memory_source_idx
  on public.jarvis_memory (source);

create index if not exists jarvis_memory_content_gin_idx
  on public.jarvis_memory using gin (content);
