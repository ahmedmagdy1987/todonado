-- ============================================================================
--  MINIMAL SUPABASE SURFACE, FOR A DISPOSABLE TEST DATABASE ONLY.
--
--  The migrations are written against a Supabase project, which supplies four
--  roles, an `auth` schema and a `storage` schema before any migration runs.
--  A bare PostgreSQL has none of them, so this file creates just enough of that
--  surface for the real migration chain to apply unmodified.
--
--  WHAT THIS IS NOT: it is not Supabase, and it is not a claim that the
--  migrations behave identically there. It reproduces the OBJECTS the
--  migrations reference (auth.users, auth.uid(), storage.objects/buckets,
--  storage.foldername, the four roles, pgcrypto) and Supabase's default grants
--  on the public schema. It does NOT reproduce GoTrue or PostgREST.
--
--  Supabase's default grants are reproduced deliberately: the point of the
--  privilege tests is to check what the migrations REMOVE, and revoking
--  something that was never granted proves nothing.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Roles Supabase provides ────────────────────────────────────────────────
-- NOLOGIN is enough: the tests reach them with SET ROLE, which is what
-- PostgREST does after authenticating a request.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- Supabase's service_role bypasses RLS. It is NOT a superuser, which is
    -- exactly why function grants have to be explicit.
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator nologin noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;

-- ── auth schema ────────────────────────────────────────────────────────────
create schema if not exists auth;

/*
 * The columns here are not arbitrary: they are exactly the ones the migration
 * chain's own triggers read. `20260602120200_auth_bootstrap` fires on insert
 * and reads `new.raw_user_meta_data` to seed the profile and default workspace,
 * so omitting that column makes every seeded user fail with
 * `record "new" has no field raw_user_meta_data`.
 *
 * Keep this list driven by the migrations. If a future one reads another
 * column, the failure should be loud here rather than a quietly skipped suite.
 */
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  email_confirmed_at  timestamptz,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Reads the request JWT claim, as PostgREST sets it per request.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- ── storage schema ─────────────────────────────────────────────────────────
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

create or replace function storage.foldername(name text) returns text[]
language sql immutable
as $$
  select string_to_array(name, '/')
$$;

grant usage on schema storage to anon, authenticated, service_role;

-- ── Supabase's default grants on public ────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
