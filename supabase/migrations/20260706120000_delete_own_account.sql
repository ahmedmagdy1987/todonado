-- ============================================================================
--  Todonado — delete_own_account()
--  Real self-service account deletion (launch hygiene).
--
--  Standard Supabase pattern: a SECURITY DEFINER function owned by the
--  migration role (postgres, which holds DELETE on auth.users) removes the
--  CALLER's auth.users row — and every user-owned row goes with it via the
--  FK graph, which was verified ON DELETE-complete at the time of writing:
--
--    auth.users ─┬─ profiles.id                 on delete cascade
--                ├─ workspaces.owner_id         on delete cascade
--                │    └─ projects → sections    on delete cascade (chain)
--                │    └─ tasks → subtasks       on delete cascade (chain)
--                │    └─ focus_sessions         on delete cascade (via workspace)
--                │    └─ calendar (none at ws)  —
--                ├─ workspace_members.user_id   on delete cascade
--                ├─ wellness_items.user_id      on delete cascade
--                │    └─ wellness_logs.item_id  on delete cascade
--                ├─ wellness_logs.user_id       on delete cascade
--                ├─ calendar_sources.user_id    on delete cascade
--                ├─ events.user_id              on delete SET NULL  (by design:
--                │      anonymous usage counts survive; no PII in events)
--                ├─ upgrade_intents.user_id     on delete SET NULL  (by design)
--                └─ feature_intents.user_id     on delete SET NULL  (by design)
--
--  auth-schema children (identities, sessions, refresh_tokens, mfa_*) cascade
--  from auth.users internally — GoTrue ships those FKs as ON DELETE CASCADE.
--
--  Guard rails:
--    * authenticated-only EXECUTE (revoked from public + anon);
--    * hard error if auth.uid() is null (defense in depth — anon has no grant);
--    * search_path pinned to '' so every reference must be schema-qualified
--      (no search-path hijack inside a definer function).
-- ============================================================================

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
