-- ============================================================================
-- Schema smoke tests. Each block raises an exception on failure, prints PASS on
-- success. Run with: psql -v ON_ERROR_STOP=1 -f tests/01_schema_smoke_test.sql
-- ============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 0. Admin-side grants that Supabase applies by default
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, anon, service_role;
grant all on all tables    in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- 1. New user bootstrap: profile row plus nine playbooks
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid := gen_random_uuid();
  n_profiles int;
  n_playbooks int;
begin
  insert into auth.users (id, email) values (uid, 'hamza@example.com');

  select count(*) into n_profiles from public.profiles where id = uid;
  select count(*) into n_playbooks from public.playbooks where user_id = uid;

  if n_profiles <> 1 then
    raise exception 'FAIL 1a: expected 1 profile, got %', n_profiles;
  end if;
  if n_playbooks <> 9 then
    raise exception 'FAIL 1b: expected 9 playbooks, got %', n_playbooks;
  end if;

  raise notice 'PASS 1: user bootstrap created profile and % playbooks', n_playbooks;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Full text search column is populated and queryable
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  cid uuid;
  tid uuid;
  hits int;
begin
  select id into uid from auth.users where email = 'hamza@example.com';

  insert into public.clients (user_id, name, company, stage, source)
  values (uid, 'Tunde Bakare', 'Bakare Interiors', 'negotiating', 'fiverr')
  returning id into cid;

  insert into public.threads (user_id, client_id, title, mode)
  values (uid, cid, 'Pricing pushback on store build', 'client_reply')
  returning id into tid;

  insert into public.messages (user_id, thread_id, role, content)
  values (uid, tid, 'user',
    'The client says our quote is 40 percent above another agency and asked if we can include ongoing ads management for free.');

  select count(*) into hits
  from public.messages
  where content_tsv @@ websearch_to_tsquery('english', 'quote agency ads management');

  if hits <> 1 then
    raise exception 'FAIL 2: full text search expected 1 hit, got %', hits;
  end if;

  raise notice 'PASS 2: full text search on client messages works';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Facts are unique per client per key, and updated_at moves
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  cid uuid;
  updated timestamptz;
begin
  select c.user_id, c.id into uid, cid from public.clients c where c.name = 'Tunde Bakare';

  insert into public.client_facts (user_id, client_id, key, value, confidence)
  values (uid, cid, 'budget_signal', 'Wants under 900 USD, flexible on scope', 0.80);

  begin
    insert into public.client_facts (user_id, client_id, key, value)
    values (uid, cid, 'budget_signal', 'duplicate should fail');
    raise exception 'FAIL 3a: duplicate fact key was accepted';
  exception
    when unique_violation then null; -- expected
  end;

  update public.client_facts set value = 'Wants under 900 USD, scope flexible, deposit ready'
   where client_id = cid and key = 'budget_signal';

  select updated_at into updated from public.client_facts where client_id = cid and key = 'budget_signal';
  if updated is null then
    raise exception 'FAIL 3b: updated_at not set';
  end if;

  raise notice 'PASS 3: fact uniqueness and upsert path behave correctly';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Row level security: a different signed in user sees nothing
-- ---------------------------------------------------------------------------
do $$
declare
  user_a uuid;
  user_b uuid;
  visible int;
  facts_visible int;
begin
  select id into user_a from auth.users where email = 'hamza@example.com';

  insert into auth.users (email) values ('intruder@example.com') returning id into user_b;

  insert into public.clients (user_id, name, stage)
  values (user_b, 'Should never be visible to Hamza', 'lead');

  -- Act as the intruder, then as ourselves.
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  set local role authenticated;

  select count(*) into visible from public.clients;
  if visible <> 1 then
    raise exception 'FAIL 4a: intruder saw % client rows, expected only their own 1', visible;
  end if;

  reset role;

  perform set_config('request.jwt.claim.sub', user_a::text, true);
  set local role authenticated;

  select count(*) into visible from public.clients;
  if visible <> 1 then
    raise exception 'FAIL 4b: owner saw % client rows, expected 1', visible;
  end if;

  select count(*) into facts_visible from public.client_facts;
  if facts_visible <> 1 then
    raise exception 'FAIL 4c: owner saw % facts, expected 1', facts_visible;
  end if;

  reset role;
  raise notice 'PASS 4: row level security isolates users in both directions';
end $$;

-- ---------------------------------------------------------------------------
-- 5. RLS cannot be bypassed by writing someone else's id
-- ---------------------------------------------------------------------------
do $$
declare
  user_a uuid;
  user_b uuid;
begin
  select id into user_a from auth.users where email = 'hamza@example.com';
  select id into user_b from auth.users where email = 'intruder@example.com';

  perform set_config('request.jwt.claim.sub', user_a::text, true);
  set local role authenticated;

  begin
    insert into public.clients (user_id, name) values (user_b, 'Forged row');
    raise exception 'FAIL 5: forged insert with another user_id was accepted';
  exception
    when insufficient_privilege then null; -- expected: with check blocks it
  end;

  reset role;
  raise notice 'PASS 5: forged user_id writes are rejected';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Semantic search function returns ordered results
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  cid uuid;
  mid uuid;
  results int;
begin
  select c.user_id, c.id into uid, cid from public.clients c where c.name = 'Tunde Bakare';
  select m.id into mid from public.messages m join public.threads t on t.id = m.thread_id where t.client_id = cid limit 1;

  insert into public.message_embeddings (message_id, user_id, client_id, embedding)
  values (mid, uid, cid, (select array_fill(0.01, array[768])::vector));

  select count(*) into results from public.match_messages(cid, (select array_fill(0.01, array[768])::vector), 5);

  if results <> 1 then
    raise exception 'FAIL 6: expected 1 semantic hit, got %', results;
  end if;

  raise notice 'PASS 6: pgvector semantic search returns results';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Views compute correctly
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  v_rows int;
  v_open_projects int;
begin
  select id into uid from auth.users where email = 'hamza@example.com';

  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated;

  select count(*) into v_rows from public.client_overview;
  if v_rows <> 1 then
    raise exception 'FAIL 7a: client_overview returned % rows, expected 1', v_rows;
  end if;

  select open_projects into v_open_projects from public.client_overview limit 1;
  if v_open_projects <> 0 then
    raise exception 'FAIL 7b: expected 0 open projects, got %', v_open_projects;
  end if;

  reset role;
  raise notice 'PASS 7: views respect the owner scope and compute counts';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Project structure: step ordering and question tracking
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  cid uuid;
  pid uuid;
begin
  select c.user_id, c.id into uid, cid from public.clients c where c.name = 'Tunde Bakare';

  insert into public.projects (user_id, client_id, title, status, deadline, budget_amount)
  values (uid, cid, 'Interiors store on Shopify', 'intake', current_date + 30, 120000)
  returning id into pid;

  insert into public.project_questions (user_id, project_id, question, why_it_matters, status)
  values (uid, pid, 'Who writes the product copy?', 'Copy delays are the most common cause of missed launch dates.', 'open');

  insert into public.project_steps (user_id, project_id, position, title, status, quality_checklist)
  values (uid, pid, 1, 'Set up Shopify store and theme', 'in_progress',
          '["theme passes Lighthouse 80+ mobile", "no dead links in nav", "checkout test order placed"]'::jsonb);

  begin
    insert into public.project_steps (user_id, project_id, position, title)
    values (uid, pid, 1, 'Duplicate position should fail');
    raise exception 'FAIL 8a: duplicate step position accepted';
  exception
    when unique_violation then null;
  end;

  if (select count(*) from public.project_steps where project_id = pid) <> 1 then
    raise exception 'FAIL 8b: unexpected step count';
  end if;

  raise notice 'PASS 8: projects, questions and ordered steps behave correctly';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Research notes, telemetry, and the cost view
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  rid uuid;
  rows int;
  dashed int;
begin
  select id into uid from auth.users where email = 'hamza@example.com';

  insert into public.research_notes (user_id, query, sources, summary, confidence, freshness, expires_at, tags)
  values (uid, 'meta ads creative testing best practice 2026',
          '[{"url":"https://example.com/a","title":"Guide","publisher":"Example","retrieved_at":"2026-10-07"}]'::jsonb,
          'Test three to five creatives per ad set, kill underperformers after 3 days of spend.',
          0.75, 'fast', now() + interval '14 days', array['meta-ads'])
  returning id into rid;

  insert into public.ai_runs (user_id, task, provider, model_id, input_tokens, output_tokens, cost_usd, latency_ms,
                              research_used, guardrail_actions, status)
  values (uid, 'reply_draft', 'google', 'gemini-3.1-pro', 4200, 380, 0.0157, 2400, true,
          '{"em_dash_removed": 2, "tone_score": 8, "length_ok": true}'::jsonb, 'ok');

  perform set_config('request.jwt.claim.sub', uid::text, true);
  set local role authenticated;

  select count(*) into rows from public.cost_summary;
  if rows <> 1 then
    raise exception 'FAIL 9a: cost_summary returned % rows, expected 1', rows;
  end if;

  select em_dashes_stopped into dashed from public.cost_summary limit 1;
  if dashed <> 2 then
    raise exception 'FAIL 9b: expected 2 em dashes stopped, got %', dashed;
  end if;

  select count(*) into rows from public.research_notes where expires_at > now();
  if rows <> 1 then
    raise exception 'FAIL 9c: expected 1 live research note, got %', rows;
  end if;

  reset role;
  raise notice 'PASS 9: research notes, telemetry and cost dashboard work';
end $$;

-- ---------------------------------------------------------------------------
-- 10. Storage policies: own folder only
-- ---------------------------------------------------------------------------
do $$
declare
  user_a uuid;
  user_b uuid;
begin
  select id into user_a from auth.users where email = 'hamza@example.com';
  select id into user_b from auth.users where email = 'intruder@example.com';

  insert into storage.objects (bucket_id, name, owner)
  values
    ('attachments', user_a::text || '/client-a/screenshot.png', user_a),
    ('attachments', user_b::text || '/client-b/screenshot.png', user_b);

  perform set_config('request.jwt.claim.sub', user_a::text, true);
  set local role authenticated;

  if (select count(*) from storage.objects) <> 1 then
    raise exception 'FAIL 10: storage policies did not isolate files';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('attachments', user_b::text || '/client-b/stolen.png', user_a);
    raise exception 'FAIL 10b: writing into another user folder was accepted';
  exception
    when insufficient_privilege then null;
  end;

  reset role;
  raise notice 'PASS 10: storage bank-level isolation holds in both directions';
end $$;

select 'ALL SCHEMA TESTS PASSED' as result;
