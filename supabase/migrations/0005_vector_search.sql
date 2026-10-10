-- ---------------------------------------------------------------------------
-- Phase 4.3b: semantic recall.
--
-- One paste in the Supabase SQL editor. Adds a 768 dimension embedding column
-- to messages and a nearest neighbour search function that returns the same
-- shape as search_messages, so the app can blend both result sets.
--
-- Until this is applied the app keeps using full text search only. Nothing
-- else breaks. Embeddings come from gemini-embedding-001 on the free tier.
-- ---------------------------------------------------------------------------

create extension if not exists vector;

alter table public.messages add column if not exists embedding vector(768);

create or replace function public.search_messages_semantic(
  p_embedding vector(768),
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
  select
    m.id,
    m.thread_id,
    t.title,
    t.client_id,
    c.name,
    m.role,
    m.channel,
    m.content,
    -- No highlighting here: the match is about meaning, not exact words.
    m.content as snippet,
    m.sent_at,
    (1 - (m.embedding <=> p_embedding))::real as rank
  from public.messages m
  join public.threads t on t.id = m.thread_id
  left join public.clients c on c.id = t.client_id
  where m.embedding is not null
    and t.user_id = auth.uid()
  order by m.embedding <=> p_embedding
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.search_messages_semantic(vector(768), integer) to authenticated;

create index if not exists messages_embedding_hnsw
  on public.messages
  using hnsw (embedding vector_cosine_ops);
