-- ============================================================================
-- Local test harness only. NOT part of the deployed database.
-- Supabase provides these objects in production. This file recreates the
-- minimum needed to run the schema against plain Postgres 17 and prove it works.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- auth schema ---------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique not null
);

-- Mirrors Supabase's auth.uid(): reads the JWT subject from the session setting.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- storage schema ------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- Mirrors Supabase's storage.foldername(): all path parts except the filename.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare parts text[];
begin
  select string_to_array(name, '/') into parts;
  return parts[1 : array_length(parts, 1) - 1];
end;
$$;

-- grants Supabase applies to these schemas by default
grant usage on schema storage to authenticated, anon, service_role;
grant all on all tables in schema storage to authenticated;
