-- ============================================================================
-- Hamza Assistant - Phase 2.1: outreach tracking and honest last activity
--
-- Two things this fixes, both discovered by importing a real Instagram history:
--
--   1. Outbound work needs its own stage. In this business, most conversations
--      start with you reaching out, and most of those get no reply yet. Calling
--      that "contacted" would put hundreds of dead threads into the same bucket
--      as warm leads. An explicit "outreach" stage keeps the pipeline honest and
--      keeps the follow up list usable.
--
--   2. "Last contact" only moved when the client wrote. That left every thread
--      you started showing "no contact recorded", which is untrue. There are now
--      two separate facts:
--        last_contact_at  the last time THEY wrote. Drives follow up urgency.
--        last_message_at  the last message in either direction. Drives sorting.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The outreach stage
-- ---------------------------------------------------------------------------
alter table public.clients drop constraint if exists clients_stage_check;

-- Existing rows cannot violate the new rule, so no data migration is needed.
alter table public.clients add constraint clients_stage_check
  check (stage in (
    'outreach','lead','contacted','quoted','negotiating','active','delivered','repeat','lost'
  ));

-- ---------------------------------------------------------------------------
-- 2. last_message_at: activity in either direction
-- ---------------------------------------------------------------------------
alter table public.clients add column if not exists last_message_at timestamptz;

-- Backfill from existing history, so the column is never lying about old rows.
update public.clients c
   set last_message_at = (
     select max(coalesce(m.sent_at, m.created_at))
       from public.messages m
       join public.threads t on t.id = m.thread_id
      where t.client_id = c.id
   )
 where c.last_message_at is null;

create index if not exists clients_last_message_idx
  on public.clients (user_id, last_message_at desc nulls last);

-- ---------------------------------------------------------------------------
-- 3. Trigger keeps both facts straight
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
  v_when      timestamptz := coalesce(new.sent_at, new.created_at, now());
begin
  select client_id into v_client_id from public.threads where id = v_thread_id;

  update public.threads set updated_at = now() where id = v_thread_id;

  if v_client_id is not null then
    update public.clients
       set last_message_at = greatest(coalesce(last_message_at, v_when), v_when),
           -- Only their messages count as contact. Yours are activity, not contact.
           last_contact_at = case
             when new.role = 'client'
               then greatest(coalesce(last_contact_at, v_when), v_when)
             else last_contact_at
           end
     where id = v_client_id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Overview carries both timestamps
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
  c.last_message_at,
  c.created_at,
  -- Alphabetical stage order would file 'outreach' between 'negotiating' and
  -- 'quoted'. Real work has to sort above cold work, so the order is declared
  -- here instead of being left to the alphabet.
  case c.stage
    when 'active'      then 1
    when 'negotiating' then 2
    when 'quoted'      then 3
    when 'contacted'   then 4
    when 'lead'        then 5
    when 'delivered'   then 6
    when 'repeat'      then 7
    when 'outreach'    then 8
    when 'lost'        then 9
    else 10
  end as stage_rank,
  (select count(*) from public.projects p
     where p.client_id = c.id and p.status not in ('delivered','cancelled')) as open_projects,
  (select count(*) from public.messages m
     join public.threads t on t.id = m.thread_id
    where t.client_id = c.id and m.role = 'client') as client_message_count,
  (select count(*) from public.messages m
     join public.threads t on t.id = m.thread_id
    where t.client_id = c.id and m.role = 'me') as my_message_count,
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

grant select on public.client_overview to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Follow up list
--
-- Outreach is excluded on purpose. With hundreds of unanswered introductions in
-- the system, mixing them into "needs attention" would bury the handful of real
-- conversations. Outreach has its own stage filter in the clients list.
--
-- Ordering is explicit: longest silent first, so the top of the list is always
-- the relationship most at risk of going cold.
-- ---------------------------------------------------------------------------
drop view if exists public.pending_followups;

create view public.pending_followups
with (security_invoker = true)
as
select
  c.id as client_id,
  c.user_id,
  c.name,
  c.stage,
  c.last_contact_at,
  now() - c.last_contact_at as since_last_contact,
  case
    when c.last_contact_at is null then 'no_reply_yet'
    when now() - c.last_contact_at > interval '7 days'
         and c.stage in ('quoted','negotiating') then 'follow_up_overdue'
    when now() - c.last_contact_at > interval '5 days'
         and c.stage in ('lead','contacted') then 'nudge'
    when now() - c.last_contact_at > interval '2 days'
         and c.stage = 'active' then 'check_in'
    else 'ok'
  end as followup_state
from public.clients c
where c.stage not in ('outreach','lost','delivered','repeat');

grant select on public.pending_followups to authenticated;

-- ============================================================================
-- End of Phase 2.1 migration.
-- ============================================================================
