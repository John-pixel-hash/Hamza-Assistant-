-- ============================================================================
-- Phase 2 smoke tests: client hub data behaviour.
-- Run through scripts/verify-schema.sh, after 0003_phase2.sql.
--
-- These tests are self contained. They create their own user and client with
-- names that no other test file uses, and they always resolve rows through the
-- owning user id. An earlier version looked clients up by name while another
-- test file used the same name, which made Postgres resolve different rows for
-- different statements and produced a misleading failure.
-- ============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Conversation roles and channels are enforced
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid := gen_random_uuid();
  cid uuid;
  tid uuid;
begin
  insert into auth.users (id, email) values (uid, 'phase2@example.com');
  insert into public.clients (user_id, name, company, stage, source, channel)
  values (uid, 'Phase Two Client', 'Phase Two Interiors', 'negotiating', 'fiverr', 'fiverr')
  returning id into cid;

  insert into public.threads (user_id, client_id, title, mode)
  values (uid, cid, 'Store build quote', 'client_reply')
  returning id into tid;

  insert into public.messages (user_id, thread_id, role, content, channel, sent_at)
  values
    (uid, tid, 'client', 'Can you do the store for 800?', 'fiverr', now() - interval '3 days'),
    (uid, tid, 'me', 'I can do 800 for the core build.', 'fiverr', now() - interval '2 days'),
    (uid, tid, 'note', 'He mentioned a competitor quote at 700.', null, now() - interval '2 days'),
    (uid, tid, 'assistant', 'Draft reply for review.', null, now() - interval '2 days');

  begin
    insert into public.messages (user_id, thread_id, role, content)
    values (uid, tid, 'robot', 'Should be refused');
    raise exception 'FAIL 1a: an unknown message role was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.messages (user_id, thread_id, role, content, channel)
    values (uid, tid, 'client', 'Bad channel', 'carrier_pigeon');
    raise exception 'FAIL 1b: an unknown channel was accepted';
  exception when check_violation then null;
  end;

  raise notice 'PASS 1: conversation roles and channels are enforced';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Activity syncs itself: last_contact_at and thread ordering update on insert
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  cid uuid;
  tid uuid;
  last_contact timestamptz;
  expected timestamptz := now() - interval '1 day';
begin
  select id into uid from auth.users where email = 'phase2@example.com';
  select id into cid from public.clients where user_id = uid and name = 'Phase Two Client';
  select id into tid from public.threads where client_id = cid and title = 'Store build quote';

  insert into public.messages (user_id, thread_id, role, content, sent_at)
  values (uid, tid, 'client', 'Following up on my last message.', expected);

  select last_contact_at into last_contact from public.clients where id = cid;

  if last_contact is null or abs(extract(epoch from (last_contact - expected))) > 2 then
    raise exception 'FAIL 2a: last_contact_at did not follow the client message (% vs %)',
      last_contact, expected;
  end if;

  -- A message from me must not move last contact, only their messages do.
  update public.clients set last_contact_at = expected where id = cid;
  insert into public.messages (user_id, thread_id, role, content, sent_at)
  values (uid, tid, 'me', 'Sent the proposal.', now());

  select last_contact_at into last_contact from public.clients where id = cid;
  if abs(extract(epoch from (last_contact - expected))) > 2 then
    raise exception 'FAIL 2b: my own message wrongly moved last_contact_at';
  end if;

  raise notice 'PASS 2: client and thread activity stay in sync automatically';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Overview counts and last message
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  row_client_overview record;
begin
  select id into uid from auth.users where email = 'phase2@example.com';

  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated;

  select * into row_client_overview
    from public.client_overview
   where name = 'Phase Two Client';

  if row_client_overview.client_message_count <> 2 then
    raise exception 'FAIL 3a: expected 2 client messages, got %', row_client_overview.client_message_count;
  end if;
  if row_client_overview.thread_count <> 1 then
    raise exception 'FAIL 3b: expected 1 thread, got %', row_client_overview.thread_count;
  end if;
  if row_client_overview.last_message_role <> 'me' then
    raise exception 'FAIL 3c: expected the latest message to be mine, got %', row_client_overview.last_message_role;
  end if;

  reset role;
  raise notice 'PASS 3: client overview carries counts and the last message';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Search finds conversations and marks the matched words safely
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  hits int;
  snippet_text text;
begin
  select id into uid from auth.users where email = 'phase2@example.com';

  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated;

  select count(*) into hits from public.search_messages('competitor quote', 20);
  if hits <> 1 then
    raise exception 'FAIL 4a: expected 1 search hit, got %', hits;
  end if;

  select snippet into snippet_text from public.search_messages('competitor quote', 20) limit 1;
  if snippet_text not like '%[[[%]]]%' then
    raise exception 'FAIL 4b: snippet did not carry highlight markers: %', snippet_text;
  end if;
  if snippet_text like '%<mark>%' then
    raise exception 'FAIL 4c: snippet leaked HTML, which would be an injection risk';
  end if;

  -- Multiple words behave like a web search: all of them must appear.
  select count(*) into hits from public.search_messages('proposal sent', 20);
  if hits <> 1 then
    raise exception 'FAIL 4d: expected 1 hit for a two word query, got %', hits;
  end if;

  -- OR widens the search, which is how you find something when you half
  -- remember the wording.
  select count(*) into hits from public.search_messages('proposal OR competitor', 20);
  if hits <> 2 then
    raise exception 'FAIL 4e: expected 2 hits for an OR query, got %', hits;
  end if;

  select count(*) into hits from public.search_messages('', 20);
  if hits <> 0 then
    raise exception 'FAIL 4f: an empty query should return nothing, got %', hits;
  end if;

  reset role;
  raise notice 'PASS 4: search works, highlights safely, and handles empty input';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Ownership still holds on the new functions and views
-- ---------------------------------------------------------------------------
do $$
declare
  other uuid;
  hits int;
begin
  other := gen_random_uuid();
  insert into auth.users (id, email) values (other, 'phase2.nosy@example.com');

  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;

  select count(*) into hits from public.search_messages('competitor', 20);
  if hits <> 0 then
    raise exception 'FAIL 5a: another user searched someone else''s messages';
  end if;

  select count(*) into hits from public.client_overview where name = 'Phase Two Client';
  if hits <> 0 then
    raise exception 'FAIL 5b: another user saw someone else''s client';
  end if;

  reset role;
  raise notice 'PASS 5: search and views respect ownership';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Client timeline function
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  cid uuid;
  rows int;
begin
  select id into uid from auth.users where email = 'phase2@example.com';
  select id into cid from public.clients where user_id = uid and name = 'Phase Two Client';

  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated;

  -- 4 messages from test 1 (client, me, note, assistant) plus 2 from test 2.
  select count(*) into rows from public.client_messages(cid, 100);
  if rows <> 6 then
    raise exception 'FAIL 6: expected 6 messages on the timeline, got %', rows;
  end if;

  reset role;
  raise notice 'PASS 6: client timeline returns the conversation';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Deleting a client removes their whole history, nothing is orphaned
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  cid uuid;
  leftovers int;
begin
  select id into uid from auth.users where email = 'phase2@example.com';
  select id into cid from public.clients where user_id = uid and name = 'Phase Two Client';

  delete from public.clients where id = cid;

  select count(*) into leftovers
  from public.messages m
  join public.threads t on t.id = m.thread_id
  where t.client_id = cid;

  if leftovers <> 0 then
    raise exception 'FAIL 7: % messages survived their client', leftovers;
  end if;

  raise notice 'PASS 7: deleting a client removes threads and messages';
end $$;

select 'ALL PHASE 2 TESTS PASSED' as result;
