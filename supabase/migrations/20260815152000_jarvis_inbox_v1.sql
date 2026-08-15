create table if not exists public.jarvis_inbox_state (
  task_id uuid not null,
  item_key text not null,
  source_type text not null default 'market_scout',
  state text not null default 'unread'
    check (state in ('unread', 'opened', 'approved', 'rejected', 'archived')),
  read_at timestamptz null,
  approved_at timestamptz null,
  rejected_at timestamptz null,
  archived_at timestamptz null,
  nova_transfer_status text null
    check (nova_transfer_status is null or nova_transfer_status in ('pending', 'transferred', 'failed')),
  nova_import_id text null,
  nova_transferred_at timestamptz null,
  nova_transfer_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, item_key)
);

create index if not exists jarvis_inbox_state_state_idx
  on public.jarvis_inbox_state (state, updated_at desc);

create index if not exists jarvis_inbox_state_source_idx
  on public.jarvis_inbox_state (source_type, updated_at desc);

alter table public.jarvis_inbox_state enable row level security;

comment on table public.jarvis_inbox_state is
  'Server-side Jarvis Inbox workflow state. Research payloads remain canonical in jarvis_tasks.';
