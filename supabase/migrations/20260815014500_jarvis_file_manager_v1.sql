create extension if not exists pgcrypto;

create table if not exists public.jarvis_files (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  path text not null unique,
  category text not null
    check (category in ('brain', 'playbook', 'policy', 'specialist', 'prompt', 'knowledge', 'config')),
  title text not null,
  format text not null default 'markdown'
    check (format in ('markdown', 'text', 'json')),
  protected boolean not null default false,
  required boolean not null default false,
  active_version integer
    check (active_version is null or active_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.jarvis_files(id) on delete cascade,
  version integer not null check (version > 0),
  content text not null check (char_length(btrim(content)) > 0 and char_length(content) <= 60000),
  change_summary text,
  created_by text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  unique (file_id, version)
);

alter table public.jarvis_files
  drop constraint if exists jarvis_files_active_version_fkey;

alter table public.jarvis_files
  add constraint jarvis_files_active_version_fkey
  foreign key (id, active_version)
  references public.jarvis_file_versions(file_id, version)
  deferrable initially deferred;

create index if not exists jarvis_file_versions_file_created_at_idx
  on public.jarvis_file_versions (file_id, created_at desc);

create index if not exists jarvis_file_versions_file_status_version_idx
  on public.jarvis_file_versions (file_id, status, version desc);

create table if not exists public.jarvis_file_change_requests (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.jarvis_files(id) on delete cascade,
  base_version integer,
  proposed_content text not null
    check (char_length(btrim(proposed_content)) > 0 and char_length(proposed_content) <= 60000),
  diff text,
  reason text,
  requested_by text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'applied')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists jarvis_file_change_requests_file_status_created_at_idx
  on public.jarvis_file_change_requests (file_id, status, created_at desc);

create or replace function public.jarvis_file_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jarvis_files_touch_updated_at on public.jarvis_files;
create trigger jarvis_files_touch_updated_at
before update on public.jarvis_files
for each row execute function public.jarvis_file_touch_updated_at();

create or replace function public.activate_jarvis_file_version(p_file_id uuid, p_version integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_file_id is null or p_version is null or p_version < 1 then
    raise exception 'jarvis_file_version_invalid';
  end if;

  if not exists (
    select 1
    from public.jarvis_file_versions
    where file_id = p_file_id and version = p_version
  ) then
    raise exception 'jarvis_file_version_not_found';
  end if;

  update public.jarvis_file_versions
  set status = 'archived'
  where file_id = p_file_id and status = 'active' and version <> p_version;

  update public.jarvis_file_versions
  set status = 'active'
  where file_id = p_file_id and version = p_version;

  update public.jarvis_files
  set active_version = p_version
  where id = p_file_id;

  return true;
end;
$$;

revoke all on function public.activate_jarvis_file_version(uuid, integer) from public;
grant execute on function public.activate_jarvis_file_version(uuid, integer) to service_role;

alter table public.jarvis_files enable row level security;
alter table public.jarvis_file_versions enable row level security;
alter table public.jarvis_file_change_requests enable row level security;

insert into public.jarvis_files (key, path, category, title, format, protected, required)
values
  ('brain.identity', 'brain/IDENTITY.md', 'brain', 'Identity', 'markdown', true, true),
  ('brain.elyon_context', 'brain/ELYON_CONTEXT.md', 'brain', 'Elyon Context', 'markdown', false, false),
  ('brain.operating_rules', 'brain/OPERATING_RULES.md', 'policy', 'Operating Rules', 'markdown', true, true),
  ('brain.capabilities', 'brain/CAPABILITIES.md', 'policy', 'Capabilities', 'markdown', true, false),
  ('brain.goals', 'brain/GOALS.md', 'brain', 'Goals', 'markdown', false, true),
  ('brain.playbooks', 'brain/PLAYBOOKS.md', 'playbook', 'Playbooks', 'markdown', false, false)
on conflict (path) do update set
  key = excluded.key,
  category = excluded.category,
  title = excluded.title,
  format = excluded.format,
  protected = excluded.protected,
  required = excluded.required;
