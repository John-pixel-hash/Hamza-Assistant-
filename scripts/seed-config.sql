-- ============================================================================
-- Seed configuration for the single account.
-- Run AFTER you have signed up once (the profile row must exist).
--
-- Important: model ids and prices below are seed values. Phase 3 ships a
-- `sync-models` script that reads each provider's live model list and
-- overwrites this table, so nothing here is trusted from memory long term.
--
-- What was verified against the live API on 8 October 2026, using this key:
--   working on the free tier: gemini-3.5-flash, gemini-3.1-flash-lite,
--                            gemini-flash-lite-latest, gemini-embedding-001,
--                            gemini-embedding-2
--   quota blocked (free tier): gemini-3.1-pro-preview
--   removed for new users:     gemini-2.5-flash, gemini-2.5-pro
-- Run `sync-models` in Phase 3 to refresh this list and the prices.
-- ============================================================================

do $$
declare
  uid uuid;
begin
  select id into uid from public.profiles order by created_at limit 1;

  if uid is null then
    raise exception 'No profile found. Sign up in the app once, then re-run this seed.';
  end if;

  -- ---------------------------------------------------------------------
  -- Google Gemini (primary provider)
  -- ---------------------------------------------------------------------
  insert into public.model_registry
    (user_id, provider, model_id, label, role, context_window,
     input_cost_per_mtok, output_cost_per_mtok,
     supports_vision, supports_tools, supports_embeddings, enabled, is_default, notes)
  values
    -- Disabled because this key is on the Gemini free tier, where Pro returns
    -- 429 RESOURCE_EXHAUSTED. The row stays so that enabling billing later is a
    -- one line change: set enabled and is_default to true and point the jobs at
    -- it below. Verified blocked on 8 October 2026.
    (uid, 'google', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro', 'heavy', 1048576,
     2.00, 12.00, true, true, false, false, false,
     'Blocked on the free tier. Enable after adding billing. Heavy reasoning: drafting, plans, research synthesis.'),

    (uid, 'google', 'gemini-3.5-flash', 'Gemini 3.5 Flash', 'balanced', 1000000,
     1.50, 9.00, true, true, false, true, true,
     'The workhorse on the free tier: vision, drafting, plans and research synthesis. Verified working 8 October 2026.'),

    (uid, 'google', 'gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'fast', 1000000,
     0.10, 0.40, true, true, false, true, false,
     'Intent classification, fact extraction, summaries, tone scoring.'),

    (uid, 'google', 'gemini-embedding-001', 'Gemini Embedding', 'embedding', null,
     0.15, 0, false, false, true, true, false,
     'Embeddings for semantic recall. Request 768 dimensions to match vector(768).')
  on conflict (user_id, provider, model_id) do update
    set label = excluded.label,
        role = excluded.role,
        context_window = excluded.context_window,
        input_cost_per_mtok = excluded.input_cost_per_mtok,
        output_cost_per_mtok = excluded.output_cost_per_mtok,
        supports_vision = excluded.supports_vision,
        supports_tools = excluded.supports_tools,
        supports_embeddings = excluded.supports_embeddings,
        notes = excluded.notes,
        updated_at = now();

  -- ---------------------------------------------------------------------
  -- Which model does which job
  -- ---------------------------------------------------------------------
  insert into public.task_routing (user_id, task, provider, model_id) values
    -- All three would be 'gemini-3.1-pro-preview' with billing enabled. On the
    -- free tier they run on Flash, which is verified working on this key.
    (uid, 'reply_draft',   'google', 'gemini-3.5-flash'),
    (uid, 'plan',          'google', 'gemini-3.5-flash'),
    (uid, 'research_synth','google', 'gemini-3.5-flash'),
    (uid, 'vision',        'google', 'gemini-3.5-flash'),
    (uid, 'summarize',     'google', 'gemini-3.5-flash'),
    (uid, 'classify',      'google', 'gemini-3.1-flash-lite'),
    (uid, 'extract_facts', 'google', 'gemini-3.1-flash-lite'),
    (uid, 'tone_score',    'google', 'gemini-3.1-flash-lite'),
    (uid, 'embed',         'google', 'gemini-embedding-001')
  on conflict (user_id, task) do update
    set provider = excluded.provider,
        model_id = excluded.model_id,
        updated_at = now();

  -- ---------------------------------------------------------------------
  -- Your business context, loaded into every prompt.
  -- Edit these in the app under Settings once the UI exists. This is a
  -- starting point based on what you told me: websites plus marketing.
  -- ---------------------------------------------------------------------
  update public.profiles
     set business_name = coalesce(business_name, 'Hamza'),
         business_summary = coalesce(business_summary,
           'I design and build websites (Shopify, WordPress, custom) and run digital '
           'marketing for clients (Meta ads, Google ads, funnels, email). Clients come '
           'mostly from Fiverr and referrals. Typical work ranges from small one off '
           'builds to ongoing retainers. I handle both the build and the marketing, so '
           'many clients stay for repeat work.'),
         tone_notes = coalesce(tone_notes,
           'Direct, warm, confident. No filler. Answer the question first. Never use '
           'em dashes. Keep replies short enough to read on a phone.')
   where id = uid;

  raise notice 'Seeded model registry, task routing and business context for user %', uid;
end $$;
