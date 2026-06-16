-- ============================================================================
--  Todonado — accounts: full name + username, username login, profile updates
--
--  - Adds full_name + username to profiles; username is UNIQUE case-insensitively.
--  - Updates the auth-bootstrap to persist name + username from signup metadata.
--  - Adds two SECURITY DEFINER RPCs used PRE-AUTH (granted to anon):
--      username_available(text)  -> boolean   (signup availability check)
--      resolve_login_email(text) -> text      (username -> email, for login)
--
--  PRIVACY NOTE (resolve_login_email): logging in by username needs the email on
--  the client to call GoTrue's signInWithPassword, so this RPC relays it. That
--  means an anonymous caller can map a KNOWN username to its email (an
--  enumeration tradeoff). It is intentionally minimal: exact, case-insensitive
--  match only; returns ONLY the email; no listing/prefix search. Usernames are
--  never displayed publicly in the app. The fully-private alternative is
--  server-side sign-in via an Edge Function that returns a session and never the
--  email — recommended once Edge Functions are deployed. Until then, rate-limiting
--  resolve_login_email at the API gateway is a REQUIRED follow-up to keep the
--  username -> email enumeration bounded (the tradeoff depends on it).
-- ============================================================================

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists username  text;

-- Username format: 3-30 chars, letters / digits / underscore. NULL allowed
-- (existing accounts have none until they set one in Settings).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles
      add constraint profiles_username_format
      check (username is null or username ~ '^[A-Za-z0-9_]{3,30}$');
  end if;
end$$;

-- Case-insensitive uniqueness. Partial (WHERE username is not null) so the many
-- existing NULL-username rows never collide with each other.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username))
  where username is not null;

-- ----------------------------------------------------------------------------
--  Bootstrap: persist name + username from signup metadata (raw_user_meta_data).
--  A duplicate username here raises a unique violation, which rolls back the
--  auth.users insert (same txn) so no orphaned account is created — the client
--  pre-checks availability to avoid this, and treats the error as "taken".
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _workspace_id uuid;
  _full_name text := nullif(
    btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name')),
    ''
  );
  _username  text := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
begin
  insert into public.profiles (id, display_name, full_name, username)
  values (
    new.id,
    coalesce(_full_name, split_part(new.email, '@', 1)),
    _full_name,
    _username
  )
  on conflict (id) do nothing;

  insert into public.workspaces (owner_id, name)
  values (new.id, 'My Workspace')
  returning id into _workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (_workspace_id, new.id, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
--  RPC: is a username available? Returns a boolean only (no PII). Safe for anon.
-- ----------------------------------------------------------------------------
create or replace function public.username_available(uname text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when uname is null or btrim(uname) = '' then false
    else not exists (
      select 1 from public.profiles where lower(username) = lower(btrim(uname))
    )
  end;
$$;

-- ----------------------------------------------------------------------------
--  RPC: resolve a username to its login email (minimal relay; see PRIVACY NOTE).
-- ----------------------------------------------------------------------------
create or replace function public.resolve_login_email(identifier text)
returns text
language sql
security definer
set search_path = public
as $$
  select u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(btrim(identifier))
  limit 1;
$$;

revoke all on function public.username_available(text) from public;
revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
