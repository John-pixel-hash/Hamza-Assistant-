-- ============================================================================
-- Hamza Assistant - Phase 2: client conversation hub
--
-- What this adds:
--   1. Message roles that describe a real client conversation, not just an AI
--      chat: client, me, note, assistant, system, tool.
--   2. Channel and sent_at, so history can be entered in any order and still
--      read correctly. You should be able to paste three weeks of old messages
--      with their real dates.
--   3. Search functions used by the search screen, so the app does not have to
--      guess at PostgREST syntax for full text search.
--   4. Triggers that keep client and thread activity in sync automatically,
--      so "last contact" can never drift from reality.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Message roles and metadata
--
-- Existing rows may use the old 'user' role, which meant "whatever I pasted".
-- In practice that was almost always the client's message, so those rows become
-- 'client'. Anything else unexpected lands on 'note' so it is never lost.
-- ---------------------------------------------------------------------------
-- Drop the old rule first, then migrate the data, then install the new rule.
alter table public.messages drop constraint if exists messages_role_check;

update public.messages set role = 'client' where role = 'user';
update public.messages
   set role = 'note'
 where role not in ('client','me','note','assistant','system','tool');

alter table public.messages add constraint messages_role_check
  check (role in ('client','me','note','assistant','system','tool'));

alter table public.messages add column if not exists channel text;
alter table public.messages add constraint messages_channel_check
  check (channel is null or channel in
    ('fiverr','email','whatsapp','instagram','call','linkedin','upwork','other'));

alter table public.messages add column if not exists sent_at timestamptz;
update public.messages set sent_at = created_at where sent_at is null;
alter table public.messages alter column sent_at set default now();

create index if not exists messages_sent_idx
  on public.messages (user_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- 2. Keep activity in sync on every message
--    last_contact_at drives the follow up view. It must be impossible for it
--    to be stale because someone forgot to update it in application code.
-- ---------------------------------------------------------------------------
create or replace function public.sync_activity_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_id uuid := coalesce(new.thread_id, old.thread_id);
  v_client_id uuid;
  v_when timestamptz := coalesce(new.sent_at, new.created_at, now());
begin
  select client_id into v_client_id from public.threads where id = v_thread_id;

  update public.threads
     set updated_at = now()
   where id = v_thread_id;

  if v_client_id is not null and new.role = 'client' then
    update public.clients
       set last_contact_at = greatest(coalesce(last_contact_at, v_when), v_when)
     where id = v_client_id;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_sync_activity on public.messages;
create trigger messages_sync_activity
  after insert on public.messages
  for each row execute function public.sync_activity_from_message();

-- ---------------------------------------------------------------------------
-- 3. Client overview, now counting real client messages and carrying the last
--    thing they said, so the list screen is one query, not twenty.
-- ---------------------------------------------------------------------------
drop view if exists public.client_overview;

create view public.client_overview
with (security_invoker = true)
as
select
  c.id,
  c.user_id,
  c.name,
  c.company,
  c.stage,
  c.source,
  c.channel,
  c.country,
  c.tags,
  c.deal_value_estimate,
  c.currency,
  c.summary,
  c.notes,
  c.last_contact_at,
  c.created_at,
  (select count(*) from public.projects p
     where p.client_id = c.id and p.status not in ('delivered','cancelled')) as open_projects,
  (select count(*) from public.messages m
     join public.threads t on t.id = m.thread_id
    where t.client_id = c.id and m.role = 'client') as client_message_count,
  (select count(*) from public.threads t
    where t.client_id = c.id) as thread_count,
  (select m.content from public.messages m
     join public.threads t on t.id = m.thread_id
    where t.client_id = c.id
    order by coalesce(m.sent_at, m.created_at) desc
    limit 1) as last_message,
  (select m.role from public.messages m
     join public.threads t on t.id = m.thread_id
    where t.client_id = c.id
    order by coalesce(m.sent_at, m.created_at) desc
    limit 1) as last_message_role
from public.clients c;

-- ---------------------------------------------------------------------------
-- 4. Search across every client conversation
--
-- Snippets use [[[ and ]]] as markers rather than <mark>, and the app renders
-- them as React elements. Client messages are untrusted text, so highlighting
-- must never become an HTML injection.
-- ---------------------------------------------------------------------------
create or replace function public.search_messages(
  p_query text,
  p_limit integer default 40
)
returns table (
  message_id   uuid,
  thread_id    uuid,
  thread_title text,
  client_id    uuid,
  client_name  text,
  role         text,
  channel      text,
  content      text,
  snippet      text,
  sent_at      timestamptz,
  rank         real
)
language sql
stable
security invoker
as $$
  with q as (
    -- Blank input produces no row, so the join returns nothing. This also
    -- avoids Postgres logging a notice for an empty text search query.
    select websearch_to_tsquery('english', trim(p_query)) as query
     where coalesce(trim(p_query), '') <> ''
  )
  select
    m.id,
    m.thread_id,
    t.title,
    t.client_id,
    c.name,
    m.role,
    m.channel,
    m.content,
    ts_headline(
      'english',
      m.content,
      q.query,
      'StartSel=[[[, StopSel=]]], MaxFragments=1, MaxWords=26, MinWords=8'
    ),
    coalesce(m.sent_at, m.created_at),
    ts_rank(m.content_tsv, q.query)
  from public.messages m
  join public.threads t on t.id = m.thread_id
  left join public.clients c on c.id = t.client_id
  cross join q
  where m.content_tsv @@ q.query
  order by ts_rank(m.content_tsv, q.query) desc, coalesce(m.sent_at, m.created_at) desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;

-- Everything said in one client's threads, for the client page timeline.
create or replace function public.client_messages(
  p_client_id uuid,
  p_limit integer default 100
)
returns table (
  message_id   uuid,
  thread_id    uuid,
  thread_title text,
  role         text,
  channel      text,
  content      text,
  sent_at      timestamptz
)
language sql
stable
security invoker
as $$
  select
    m.id,
    m.thread_id,
    t.title,
    m.role,
    m.channel,
    m.content,
    coalesce(m.sent_at, m.created_at)
  from public.messages m
  join public.threads t on t.id = m.thread_id
  where t.client_id = p_client_id
  order by coalesce(m.sent_at, m.created_at) desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

grant execute on function public.search_messages(text, integer) to authenticated;
grant execute on function public.client_messages(uuid, integer) to authenticated;

-- Recreated views lose their grants, and Supabase default privileges are not
-- guaranteed. Being explicit here means the app can always read them.
grant select on public.client_overview  to authenticated;
grant select on public.pending_followups to authenticated;
grant select on public.cost_summary      to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Attachment helpers
--    Files are private. The app asks for a short lived signed URL per file.
-- ---------------------------------------------------------------------------
create index if not exists attachments_client_idx on public.attachments (client_id, created_at desc);

-- ============================================================================
-- End of Phase 2 migration.
-- ============================================================================
