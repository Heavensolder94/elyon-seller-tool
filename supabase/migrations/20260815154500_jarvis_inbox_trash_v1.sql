alter table public.jarvis_inbox_state
  add column if not exists previous_state text null,
  add column if not exists trashed_at timestamptz null,
  add column if not exists deleted_at timestamptz null;

alter table public.jarvis_inbox_state
  drop constraint if exists jarvis_inbox_state_state_check;

alter table public.jarvis_inbox_state
  add constraint jarvis_inbox_state_state_check
  check (state in ('unread','opened','approved','rejected','archived','trashed','deleted'));

alter table public.jarvis_inbox_state
  drop constraint if exists jarvis_inbox_state_previous_state_check;

alter table public.jarvis_inbox_state
  add constraint jarvis_inbox_state_previous_state_check
  check (previous_state is null or previous_state in ('unread','opened','approved','rejected','archived'));

create index if not exists jarvis_inbox_state_trash_idx
  on public.jarvis_inbox_state (trashed_at desc)
  where state = 'trashed';

comment on column public.jarvis_inbox_state.previous_state is 'Inbox state before moving an item to trash; used for restore.';
comment on column public.jarvis_inbox_state.deleted_at is 'Tombstone timestamp for permanent Inbox removal. Underlying jarvis_tasks audit row is retained.';
