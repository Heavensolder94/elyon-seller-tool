create table if not exists public.jarvis_conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'seller_tool',
  scope text not null default 'seller',
  status text not null default 'active' check (status in ('active', 'archived')),
  summary text not null default '',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.jarvis_conversation_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.jarvis_working_memory (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.jarvis_conversation_sessions(id) on delete cascade,
  scope text not null default 'seller',
  state jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version >= 1),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, scope)
);

create index if not exists idx_jarvis_conversation_sessions_channel_updated
  on public.jarvis_conversation_sessions(channel, updated_at desc);
create index if not exists idx_jarvis_conversation_messages_conversation_created
  on public.jarvis_conversation_messages(conversation_id, created_at desc);
create index if not exists idx_jarvis_working_memory_conversation_scope
  on public.jarvis_working_memory(conversation_id, scope);
