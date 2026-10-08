-- ============================================================================
-- Phase 2.1 smoke test: outreach tracking and honest activity timestamps
--
-- Run through scripts/verify-schema.sh, after 0004_outreach_tracking.sql.
--
-- The checks run as the authenticated role, not as the superuser, so row level
-- security is genuinely exercised rather than bypassed. That is the same
-- pattern tests/01_schema_smoke_test.sql uses.
-- ============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Fixtures. Two accounts, so ownership can be tested in both directions.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'phase21-owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'phase21-other@example.com')
on conflict (id) do nothing;

do $$
declare
  v_user   uuid := '11111111-1111-1111-1111-111111111111';
  v_other  uuid := '22222222-2222-2222-2222-222222222222';
  v_warm   uuid;
  v_cold   uuid;
  v_thread uuid;
  v_state  text;
  v_rank   int;
  v_count  int;
  v_lt     timestamptz;
  v_lc     timestamptz;
begin
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  set local role authenticated;

  -- =========================================================================
  -- 1. The outreach stage is accepted
  -- =========================================================================
  insert into public.clients (user_id, name, stage, source, channel)
  values (v_user, 'Phase Two One Cold', 'outreach', 'instagram', 'instagram')
  returning id into v_cold;

  insert into public.clients (user_id, name, stage, source, channel)
  values (v_user, 'Phase Two One Warm', 'lead', 'instagram', 'instagram')
  returning id into v_warm;

  if v_cold is null or v_warm is null then
    raise exception 'FAIL 1: could not insert clients using the outreach stage';
  end if;
  raise notice 'PASS 1: outreach stage accepted';

  -- =========================================================================
  -- 2. An invalid stage is still rejected
  -- =========================================================================
  begin
    insert into public.clients (user_id, name, stage)
    values (v_user, 'Phase Two One Bad', 'vibing');
    raise exception 'FAIL 2: an invalid stage was accepted';
  exception
    when check_violation then
      raise notice 'PASS 2: invalid stage rejected';
  end;

  -- =========================================================================
  -- 3. My own message moves last_message_at but never last_contact_at
  -- =========================================================================
  insert into public.threads (user_id, client_id, title)
  values (v_user, v_cold, 'Instagram: phase two one cold')
  returning id into v_thread;

  insert into public.messages (user_id, thread_id, role, content, channel, sent_at)
  values (v_user, v_thread, 'me', 'Intro message', 'instagram', now() - interval '3 days');

  select last_message_at, last_contact_at into v_lt, v_lc
    from public.clients where id = v_cold;

  if v_lt is null then
    raise exception 'FAIL 3a: last_message_at not set by my own message';
  end if;
  if v_lc is not null then
    raise exception 'FAIL 3b: last_contact_at moved on my own message, it must only move on theirs';
  end if;
  raise notice 'PASS 3: my own message counts as activity, not as contact';

  -- =========================================================================
  -- 4. Their reply moves both
  -- =========================================================================
  insert into public.messages (user_id, thread_id, role, content, channel, sent_at)
  values (v_user, v_thread, 'client', 'Yes I am interested', 'instagram', now() - interval '1 day');

  select last_message_at, last_contact_at into v_lt, v_lc
    from public.clients where id = v_cold;

  if v_lc is null then
    raise exception 'FAIL 4: last_contact_at did not move when the client replied';
  end if;
  if v_lt < v_lc then
    raise exception 'FAIL 4b: last_message_at (%) must not be behind last_contact_at (%)', v_lt, v_lc;
  end if;
  raise notice 'PASS 4: their reply moves both timestamps';

  -- =========================================================================
  -- 5. A newer message of mine does not drag last_contact_at forward
  -- =========================================================================
  insert into public.messages (user_id, thread_id, role, content, channel, sent_at)
  values (v_user, v_thread, 'me', 'Following up', 'instagram', now());

  select last_contact_at into v_lc from public.clients where id = v_cold;
  if v_lc > now() - interval '2 hours' then
    raise exception 'FAIL 5: last_contact_at was dragged forward by my own follow up';
  end if;
  raise notice 'PASS 5: follow ups do not fake a client contact';

  -- =========================================================================
  -- 6. The follow up list carries real conversations and skips cold outreach
  -- =========================================================================
  select count(*) into v_count
    from public.pending_followups where client_id = v_cold;
  if v_count <> 0 then
    raise exception 'FAIL 6a: a client who replied is missing from follow ups';
  end if;

  select count(*) into v_count from public.pending_followups where client_id = v_warm;
  if v_count <> 1 then
    raise exception 'FAIL 6b: the untouched lead should appear in follow ups exactly once';
  end if;

  select followup_state into v_state from public.pending_followups where client_id = v_warm;
  if v_state <> 'no_reply_yet' then
    raise exception 'FAIL 6c: expected no_reply_yet for a lead who never wrote, got %', v_state;
  end if;
  raise notice 'PASS 6: follow ups track real conversations and stay quiet on cold outreach';

  -- =========================================================================
  -- 7. Cold outreach sorts below live work
  -- =========================================================================
  select stage_rank into v_rank from public.client_overview where id = v_cold;
  if v_rank is null or v_rank <> 8 then
    raise exception 'FAIL 7a: outreach should rank 8, got %', v_rank;
  end if;

  select stage_rank into v_rank from public.client_overview where id = v_warm;
  if v_rank <> 5 then
    raise exception 'FAIL 7b: lead should rank 5, got %', v_rank;
  end if;
  raise notice 'PASS 7: live work sorts above cold outreach regardless of the alphabet';

  -- =========================================================================
  -- 8. The overview reports both sides of the conversation
  -- =========================================================================
  select my_message_count, client_message_count into v_rank, v_count
    from public.client_overview where id = v_cold;

  if v_rank <> 2 then
    raise exception 'FAIL 8a: expected 2 of my messages, got %', v_rank;
  end if;
  if v_count <> 1 then
    raise exception 'FAIL 8b: expected 1 message from them, got %', v_count;
  end if;
  raise notice 'PASS 8: overview splits my messages from theirs';

  -- =========================================================================
  -- 9. Ownership. The other account must see none of this.
  -- =========================================================================
  reset role;
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  set local role authenticated;

  select count(*) into v_count from public.client_overview
   where id in (v_cold, v_warm);
  if v_count <> 0 then
    raise exception 'FAIL 9a: another account can see these clients through client_overview';
  end if;

  select count(*) into v_count from public.pending_followups
   where client_id in (v_cold, v_warm);
  if v_count <> 0 then
    raise exception 'FAIL 9b: another account can see these clients through pending_followups';
  end if;

  select count(*) into v_count from public.messages where thread_id = v_thread;
  if v_count <> 0 then
    raise exception 'FAIL 9c: another account can read the imported conversation';
  end if;
  raise notice 'PASS 9: both views and the conversation stay inside the owning account';

  reset role;
  raise notice '--- Phase 2.1 smoke test complete ---';
end;
$$;

-- ============================================================================
-- Clean up, so re-running this file is always safe.
-- ============================================================================
delete from auth.users
 where email in ('phase21-owner@example.com', 'phase21-other@example.com');

select 'ALL PHASE 2.1 TESTS PASSED' as result;
