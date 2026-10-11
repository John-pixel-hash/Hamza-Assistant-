-- ---------------------------------------------------------------------------
-- Phase 5: a private slot for the owner's research key.
-- One row per user, readable and writable only by that user. The settings
-- page saves the Tavily key here so a redeploy is never needed.
-- ---------------------------------------------------------------------------

create table if not exists public.user_secrets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  tavily_key text,
  updated_at timestamptz not null default now()
);

alter table public.user_secrets enable row level security;

drop policy if exists user_secrets_owner on public.user_secrets;
create policy user_secrets_owner on public.user_secrets
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
