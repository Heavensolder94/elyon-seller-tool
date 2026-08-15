alter table public.jarvis_file_change_requests
  add column if not exists proposed_version integer,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists applied_version integer,
  add column if not exists applied_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jarvis_file_change_requests_proposed_version_fkey'
      and conrelid = 'public.jarvis_file_change_requests'::regclass
  ) then
    alter table public.jarvis_file_change_requests
      add constraint jarvis_file_change_requests_proposed_version_fkey
      foreign key (file_id, proposed_version)
      references public.jarvis_file_versions(file_id, version)
      deferrable initially deferred;
  end if;
end
$$;

create unique index if not exists jarvis_file_change_requests_file_proposed_version_uidx
  on public.jarvis_file_change_requests (file_id, proposed_version)
  where proposed_version is not null;

create table if not exists public.jarvis_file_actions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.jarvis_files(id) on delete cascade,
  change_request_id uuid references public.jarvis_file_change_requests(id) on delete set null,
  action text not null
    check (action in ('draft_created', 'approved', 'activated', 'rollback', 'repository_fallback')),
  from_version integer,
  to_version integer,
  actor text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists jarvis_file_actions_file_created_at_idx
  on public.jarvis_file_actions (file_id, created_at desc);

alter table public.jarvis_file_actions enable row level security;

create or replace function public.create_jarvis_file_draft_change(
  p_file_id uuid,
  p_content text,
  p_summary text,
  p_actor text,
  p_expected_active integer,
  p_allow_protected boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active integer;
  v_protected boolean;
  v_next_version integer;
  v_version_id uuid;
  v_change_id uuid;
begin
  if p_file_id is null then
    raise exception 'jarvis_file_registry_row_missing';
  end if;
  if p_content is null or char_length(btrim(p_content)) = 0 then
    raise exception 'jarvis_file_content_required';
  end if;
  if char_length(p_content) > 60000 then
    raise exception 'jarvis_file_content_too_large';
  end if;

  select active_version, protected
    into v_active, v_protected
  from public.jarvis_files
  where id = p_file_id
  for update;

  if not found then
    raise exception 'jarvis_file_registry_row_missing';
  end if;
  if v_protected and coalesce(p_allow_protected, false) is not true then
    raise exception 'jarvis_file_protected';
  end if;
  if v_active is distinct from p_expected_active then
    raise exception 'jarvis_file_version_conflict';
  end if;

  update public.jarvis_file_change_requests
  set status = 'cancelled', resolved_at = now()
  where file_id = p_file_id
    and status in ('pending', 'approved');

  update public.jarvis_file_versions
  set status = 'archived'
  where file_id = p_file_id
    and status = 'draft';

  select coalesce(max(version), 0) + 1
    into v_next_version
  from public.jarvis_file_versions
  where file_id = p_file_id;

  insert into public.jarvis_file_versions (
    file_id,
    version,
    content,
    change_summary,
    created_by,
    status
  ) values (
    p_file_id,
    v_next_version,
    btrim(p_content),
    nullif(btrim(coalesce(p_summary, '')), ''),
    nullif(btrim(coalesce(p_actor, '')), ''),
    'draft'
  )
  returning id into v_version_id;

  insert into public.jarvis_file_change_requests (
    file_id,
    base_version,
    proposed_version,
    proposed_content,
    reason,
    requested_by,
    status
  ) values (
    p_file_id,
    v_active,
    v_next_version,
    btrim(p_content),
    nullif(btrim(coalesce(p_summary, '')), ''),
    nullif(btrim(coalesce(p_actor, '')), ''),
    'pending'
  )
  returning id into v_change_id;

  insert into public.jarvis_file_actions (
    file_id,
    change_request_id,
    action,
    from_version,
    to_version,
    actor,
    detail
  ) values (
    p_file_id,
    v_change_id,
    'draft_created',
    v_active,
    v_next_version,
    nullif(btrim(coalesce(p_actor, '')), ''),
    nullif(btrim(coalesce(p_summary, '')), '')
  );

  return jsonb_build_object(
    'change_request_id', v_change_id,
    'version_id', v_version_id,
    'version', v_next_version,
    'status', 'pending',
    'base_version', v_active
  );
end;
$$;

create or replace function public.approve_jarvis_file_change_request(
  p_change_request_id uuid,
  p_actor text,
  p_allow_protected boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file_id uuid;
  v_version integer;
  v_status text;
  v_protected boolean;
begin
  select cr.file_id, cr.proposed_version, cr.status, f.protected
    into v_file_id, v_version, v_status, v_protected
  from public.jarvis_file_change_requests cr
  join public.jarvis_files f on f.id = cr.file_id
  where cr.id = p_change_request_id
  for update of cr;

  if not found then
    raise exception 'jarvis_file_change_request_not_found';
  end if;
  if v_status <> 'pending' then
    raise exception 'jarvis_file_change_request_not_pending';
  end if;
  if v_protected and coalesce(p_allow_protected, false) is not true then
    raise exception 'jarvis_file_protected';
  end if;
  if v_version is null or not exists (
    select 1 from public.jarvis_file_versions
    where file_id = v_file_id and version = v_version and status = 'draft'
  ) then
    raise exception 'jarvis_file_version_not_found';
  end if;

  update public.jarvis_file_change_requests
  set status = 'approved',
      approved_by = nullif(btrim(coalesce(p_actor, '')), ''),
      approved_at = now()
  where id = p_change_request_id;

  insert into public.jarvis_file_actions (
    file_id, change_request_id, action, to_version, actor, detail
  ) values (
    v_file_id,
    p_change_request_id,
    'approved',
    v_version,
    nullif(btrim(coalesce(p_actor, '')), ''),
    'Draft freigegeben'
  );

  return true;
end;
$$;

create or replace function public.apply_jarvis_file_change_request(
  p_change_request_id uuid,
  p_actor text,
  p_allow_protected boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file_id uuid;
  v_base integer;
  v_version integer;
  v_status text;
  v_protected boolean;
  v_current integer;
begin
  select cr.file_id, cr.base_version, cr.proposed_version, cr.status, f.protected
    into v_file_id, v_base, v_version, v_status, v_protected
  from public.jarvis_file_change_requests cr
  join public.jarvis_files f on f.id = cr.file_id
  where cr.id = p_change_request_id
  for update of cr;

  if not found then
    raise exception 'jarvis_file_change_request_not_found';
  end if;
  if v_status <> 'approved' then
    raise exception 'jarvis_file_change_request_not_approved';
  end if;
  if v_protected and coalesce(p_allow_protected, false) is not true then
    raise exception 'jarvis_file_protected';
  end if;
  if v_version is null then
    raise exception 'jarvis_file_version_invalid';
  end if;

  select active_version into v_current
  from public.jarvis_files
  where id = v_file_id
  for update;

  if not found then
    raise exception 'jarvis_file_registry_row_missing';
  end if;
  if v_current is distinct from v_base then
    raise exception 'jarvis_file_version_conflict';
  end if;
  if not exists (
    select 1 from public.jarvis_file_versions
    where file_id = v_file_id and version = v_version and status = 'draft'
  ) then
    raise exception 'jarvis_file_version_not_found';
  end if;

  update public.jarvis_file_versions
  set status = 'archived'
  where file_id = v_file_id
    and status = 'active'
    and version <> v_version;

  update public.jarvis_file_versions
  set status = 'active'
  where file_id = v_file_id
    and version = v_version;

  update public.jarvis_files
  set active_version = v_version
  where id = v_file_id;

  update public.jarvis_file_change_requests
  set status = 'applied',
      applied_version = v_version,
      applied_at = now(),
      resolved_at = now()
  where id = p_change_request_id;

  insert into public.jarvis_file_actions (
    file_id, change_request_id, action, from_version, to_version, actor, detail
  ) values (
    v_file_id,
    p_change_request_id,
    'activated',
    v_current,
    v_version,
    nullif(btrim(coalesce(p_actor, '')), ''),
    'Freigegebenen Draft aktiviert'
  );

  return true;
end;
$$;

create or replace function public.rollback_jarvis_file_version(
  p_file_id uuid,
  p_target_version integer,
  p_actor text,
  p_reason text,
  p_allow_protected boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_protected boolean;
  v_action text;
begin
  select active_version, protected
    into v_current, v_protected
  from public.jarvis_files
  where id = p_file_id
  for update;

  if not found then
    raise exception 'jarvis_file_registry_row_missing';
  end if;
  if v_protected and coalesce(p_allow_protected, false) is not true then
    raise exception 'jarvis_file_protected';
  end if;
  if p_target_version is not null and p_target_version < 1 then
    raise exception 'jarvis_file_version_invalid';
  end if;
  if v_current is not distinct from p_target_version then
    raise exception 'jarvis_file_rollback_noop';
  end if;
  if p_target_version is not null and not exists (
    select 1 from public.jarvis_file_versions
    where file_id = p_file_id and version = p_target_version
  ) then
    raise exception 'jarvis_file_version_not_found';
  end if;

  update public.jarvis_file_change_requests
  set status = 'cancelled', resolved_at = now()
  where file_id = p_file_id
    and status in ('pending', 'approved');

  update public.jarvis_file_versions
  set status = 'archived'
  where file_id = p_file_id
    and status in ('active', 'draft');

  if p_target_version is not null then
    update public.jarvis_file_versions
    set status = 'active'
    where file_id = p_file_id
      and version = p_target_version;
    v_action := 'rollback';
  else
    v_action := 'repository_fallback';
  end if;

  update public.jarvis_files
  set active_version = p_target_version
  where id = p_file_id;

  insert into public.jarvis_file_actions (
    file_id, action, from_version, to_version, actor, detail
  ) values (
    p_file_id,
    v_action,
    v_current,
    p_target_version,
    nullif(btrim(coalesce(p_actor, '')), ''),
    nullif(btrim(coalesce(p_reason, '')), '')
  );

  return true;
end;
$$;

revoke all on function public.create_jarvis_file_draft_change(uuid, text, text, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.approve_jarvis_file_change_request(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.apply_jarvis_file_change_request(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.rollback_jarvis_file_version(uuid, integer, text, text, boolean) from public, anon, authenticated;

grant execute on function public.create_jarvis_file_draft_change(uuid, text, text, text, integer, boolean) to service_role;
grant execute on function public.approve_jarvis_file_change_request(uuid, text, boolean) to service_role;
grant execute on function public.apply_jarvis_file_change_request(uuid, text, boolean) to service_role;
grant execute on function public.rollback_jarvis_file_version(uuid, integer, text, text, boolean) to service_role;
