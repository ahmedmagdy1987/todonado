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
--  ── THIS FILE USED TO INVENT PRIVILEGES, AND IT COST A MONEY-PATH BUG ─────
--
--  It used to end with:
--
--      alter default privileges in schema public
--        grant all on tables    to anon, authenticated, service_role;
--      alter default privileges in schema public
--        grant all on functions to anon, authenticated, service_role;
--
--  described as "Supabase's default grants … reproduced deliberately". That was
--  true once and is not true now, and while it was wrong this suite reported a
--  working money path that the real platform refuses. The
--  `supabase postgrest permissions` job — a FULLY LOCAL Supabase stack, GoTrue
--  and PostgREST and all — answered a plain service-role SELECT on
--  public.billing with
--
--      42501 permission denied for table billing
--
--  while the raw-PostgreSQL suite three jobs over called the same read green,
--  because this file had handed service_role ALL on every table created in
--  public afterwards. That is why a missing GRANT survived three billing
--  migrations and a security review.
--
--  THE PLATFORM CHANGED, AND THE REPO ALREADY SAID SO. supabase/config.toml
--  documents `auto_expose_new_tables`: it "controls whether new tables, views,
--  sequences and functions created in the `public` schema by `postgres` are
--  reachable through the Data API roles (`anon`, `authenticated`,
--  `service_role`) without explicit GRANTs", its implicit default "flips to
--  `false` on 2026-05-30 to match the new cloud default", and the field is
--  "removed in 2026-10-30 once the always-revoked behaviour is permanent".
--  That date is past. Automatic grants are not a thing the Data API roles get
--  any more — for ANY of the three, not just service_role — so reproducing them
--  is not fidelity, it is fiction.
--
--  THE RULE THIS FILE NOW FOLLOWS: it may create Supabase's INFRASTRUCTURE —
--  the four roles, the auth and storage schemas, the extensions, schema-level
--  USAGE — but it may NOT invent a privilege on an APPLICATION table or
--  function. Every such privilege must come from supabase/migrations/, where it
--  is reviewed, versioned, and actually applied to production. A privilege this
--  file grants is a privilege production never got.
--
--  WHAT REMAINS TRUE FROM THE OLD COMMENT: revoking something that was never
--  granted proves nothing. That is now handled the right way round —
--  20260801160000_billing_service_role_access.sql REVOKES from every role and
--  then GRANTS exactly what is needed, so its end state is identical whether or
--  not a platform default happened to fire first, and
--  db-tests/billingGrant.db.test.ts proves the grant is the migration's doing by
--  applying the chain only as far as 20260801150000 and watching service_role
--  still be refused.
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

-- ── Schema-level access on public — INFRASTRUCTURE, not an application grant ─
--
-- USAGE on the schema is the one thing that genuinely is platform setup: it
-- carries no right to read, write or execute anything, it only lets a role
-- ADDRESS objects whose own privileges it already holds. Without it every test
-- below would fail for the wrong reason. PostgREST's three roles hold it on the
-- real stack, and permissions.db.test.ts asserts service_role has USAGE and
-- NOT CREATE, which is exactly this line and the absence of a second one.
grant usage on schema public to anon, authenticated, service_role;

/*
 * THERE IS DELIBERATELY NO `alter default privileges` HERE ANY MORE.
 *
 * See the header. Two lines used to hand anon, authenticated and service_role
 * ALL on every table and function created in public afterwards; they modelled a
 * platform behaviour that ended on 2026-05-30 (supabase/config.toml,
 * `auto_expose_new_tables`) and they hid a real 42501 on public.billing.
 *
 * Consequence, stated so the next reader is not surprised: in this disposable
 * database a Data API role holds a privilege on an application table ONLY where
 * a migration granted it. Today that is
 *
 *   - the five billing/checkout SECURITY DEFINER functions, EXECUTE to
 *     service_role, from 20260801150000_checkout_attempts.sql; and
 *   - SELECT on public.billing to service_role and authenticated, from
 *     20260801160000_billing_service_role_access.sql.
 *
 * Everything else is unreachable by anon/authenticated/service_role here. That
 * is a faithful reproduction of a freshly provisioned Supabase project, and it
 * is why db-tests/billingGrant.db.test.ts can prove which file grants what.
 */
