create or replace function public.jarvis_file_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.activate_jarvis_file_version(uuid, integer) from public;
revoke all on function public.activate_jarvis_file_version(uuid, integer) from anon;
revoke all on function public.activate_jarvis_file_version(uuid, integer) from authenticated;
grant execute on function public.activate_jarvis_file_version(uuid, integer) to service_role;
