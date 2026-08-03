-- ============================================================================
--  Todonado — the Data API privilege contract for the WHOLE application
--
--  WHY THIS EXISTS: THE MIGRATION CHAIN DID NOT DESCRIBE A WORKING DATABASE.
--
--  20260801160000 fixed `billing` because that is where the failure was caught.
--  It is not where the failure ends. The `supabase postgrest permissions` CI job
--  prints the local stack's real defaults, and they are:
--
--    for postgres, in public, tables:
--      {postgres=arwdDxtm/postgres, anon=Dxtm/postgres,
--       authenticated=Dxtm/postgres, service_role=Dxtm/postgres}
--
--  D=TRUNCATE, x=REFERENCES, t=TRIGGER, m=MAINTAIN. a=INSERT, r=SELECT,
--  w=UPDATE and d=DELETE are absent for every Data API role. Supabase narrowed
--  the default ACL to the privileges nothing uses (supabase/config.toml records
--  `auto_expose_new_tables` flipping implicitly to false on 2026-05-30 and the
--  setting disappearing on 2026-10-30).
--
--  No migration in this repository has ever granted a table privilege to `anon`
--  or `authenticated`. The live project works only because it was provisioned
--  while the old blanket default still applied and its tables still carry those
--  grants. A project created from this chain today — a staging environment, a
--  disaster-recovery restore, a second region — comes up with RLS policies that
--  are never consulted, because the grant layer refuses first. The user signs
--  in and sees nothing, everywhere.
--
--  AND IT FAILS SILENTLY, WHICH IS WORSE. Every feature hook classifies only
--  PGRST205/42P01 as "table missing" and treats everything else — including
--  42501 — as an empty result. An under-granted SELECT produces an empty Vision
--  page, an empty journal, zero mind maps, a Free badge for a paying Pro
--  subscriber, and a capacity meter silently reset to the 6-hour default,
--  with no error anywhere. That is why the contract below is derived from real
--  call sites and then PROVED by an executable smoke suite
--  (db-tests/freshProject.postgrest.test.ts) rather than reasoned about.
--
--  ── HOW THE CONTRACT WAS DERIVED ──────────────────────────────────────────
--
--  Every privilege below has a production call site. Every privilege NOT below
--  was refused because it has none, even where an RLS policy would have allowed
--  it. Four such refusals are deliberate and load-bearing:
--
--    workspaces         UPDATE/DELETE  policies exist; no rename or delete UI.
--    workspace_members  UPDATE/DELETE  policies exist; no member-management UI.
--    projects           DELETE         the product ARCHIVES (an UPDATE to
--                                      status). The only .delete() is in
--                                      scripts/seed.mjs, a dev script.
--    calendar_sources   UPDATE         a policy exists; sources are added and
--                                      removed, never edited.
--
--  A privilege granted "for symmetry" is a privilege nobody reviewed.
--
--  ── THREE THINGS THIS FILE DELIBERATELY DOES NOT DO ───────────────────────
--
--  1. IT TOUCHES NO FUNCTION PRIVILEGE. It is tempting to pair this with
--     `revoke execute on all functions in schema public from public`. That
--     would take the entire product down in one statement. PostgreSQL evaluates
--     an RLS policy expression as the QUERYING role, and
--     is_workspace_member / is_workspace_owner / can_access_project /
--     can_access_task / project_workspace / section_workspace have no explicit
--     EXECUTE grant anywhere in this repo — PUBLIC's implicit default is the
--     only thing making every policy in the app evaluable. Table privileges
--     only. Where a helper needed an explicit grant it already has one
--     (mind_map_links_ok, 20260731120000).
--
--  2. IT TOUCHES NOTHING OUTSIDE SCHEMA public. In particular no GRANT on
--     storage.objects: that table is owned by supabase_storage_admin, and
--     20260801130000 already records that this repo's migration role may not
--     own it ("ERROR: must be owner of table objects"). A grant there would
--     abort the migration. Storage authorisation is the four
--     `(storage.foldername(name))[1] = auth.uid()::text` policies from
--     20260731140000, and Supabase manages the object-table grants itself.
--
--  3. IT GRANTS `anon` NOTHING ON `events`, AND THAT IS A DECISION, NOT AN
--     OVERSIGHT. `events_insert` is written `to anon, authenticated`, so the
--     policy intends to permit an anonymous event. No such caller exists:
--     AuthProvider only tracks when there is a user id, and all twenty other
--     track() sites are inside the authenticated shell. The rule here is "no
--     privilege without a production path", so anon is omitted. IF an anonymous
--     track() is ever added to a public page it will fail with 42501, not be
--     quietly accepted — add `grant insert on table public.events to anon;` in
--     a new migration at that point, deliberately.
--
--  ── NOT PURELY ADDITIVE ───────────────────────────────────────────────────
--
--  On the live project this REVOKES the broad historical grants before granting
--  the narrow set. Expected effects there:
--    * anon loses SELECT on every application table. Anonymous reads answered
--      `200 []` through RLS and now answer 42501. Nothing in the app makes one;
--      the live-probe recipes in CLAUDE.md §7 change answer accordingly.
--    * authenticated loses the privileges listed as refused above.
--    * service_role loses direct access to everything except the two reads it
--      genuinely performs (billing, calendar_sources).
--  Nothing the application does is removed. That claim is executable:
--  db-tests/freshProject.postgrest.test.ts drives the real flows through
--  PostgREST as real users on a stack built only from these migrations.
--
--  Idempotent: GRANT and REVOKE are declarative, and every table is revoked
--  from all four roles before anything is granted, so the end state does not
--  depend on what the platform did or did not hand out first.
-- ============================================================================

-- ── The task engine ─────────────────────────────────────────────────────────

-- profiles: read/created/updated by the browser. The INSERT is the resilience
-- fallback in WorkspaceProvider for a user whose signup trigger did not
-- provision. No DELETE: delete_own_account() is SECURITY DEFINER and cascades
-- as its owner, so the caller needs no privilege on any cascaded table.
revoke all on table public.profiles from public, anon, authenticated, service_role;
grant select, insert, update on table public.profiles to authenticated;

-- workspaces: selected on load, inserted by the same fallback (which chains
-- .select(), so SELECT is required for the write to return its row).
revoke all on table public.workspaces from public, anon, authenticated, service_role;
grant select, insert on table public.workspaces to authenticated;

-- workspace_members: SELECT is required by the settings data export; INSERT by
-- the fallback. is_workspace_member() already resolves an owner through
-- workspaces.owner_id, so the membership row is not load-bearing for access.
revoke all on table public.workspace_members from public, anon, authenticated, service_role;
grant select, insert on table public.workspace_members to authenticated;

-- projects: archived, never deleted.
revoke all on table public.projects from public, anon, authenticated, service_role;
grant select, insert, update on table public.projects to authenticated;

revoke all on table public.sections from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.sections to authenticated;

-- tasks: complete_task() is SECURITY INVOKER (20260622140000), so "it goes
-- through an RPC" does NOT remove the requirement — the function's UPDATE and
-- INSERT run as the caller. Without these three grants every checkbox in the
-- product answers 42501.
revoke all on table public.tasks from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.tasks to authenticated;

revoke all on table public.subtasks from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.subtasks to authenticated;

-- focus_sessions: started, updated while running, never deleted by the UI.
revoke all on table public.focus_sessions from public, anon, authenticated, service_role;
grant select, insert, update on table public.focus_sessions to authenticated;

-- ── Calendar ────────────────────────────────────────────────────────────────

-- calendar_sources: the browser adds and removes sources; api/calendar-fetch.ts
-- READS them with the service-role client, filtered to the JWT-verified caller.
-- That read is direct (not an RPC), so it needs a real grant — the same class
-- of defect as the billing 42501.
revoke all on table public.calendar_sources from public, anon, authenticated, service_role;
grant select, insert, delete on table public.calendar_sources to authenticated;
grant select on table public.calendar_sources to service_role;

-- ── Insert-only intake and analytics ────────────────────────────────────────

-- events: append-only product analytics. No SELECT for anyone — the client
-- never reads it back, and the settings export lists it by mistake (it filters
-- on a workspace_id column this table does not have, so that read has always
-- failed). Granting SELECT would turn a 42501 into a 42703 and buy nothing.
revoke all on table public.events from public, anon, authenticated, service_role;
grant insert on table public.events to authenticated;

-- upgrade_intents / feature_intents: the two fake doors, and the ONLY tables
-- an anonymous visitor may write. /pricing and /welcome are public routes and
-- both surfaces render for logged-out visitors, so removing anon INSERT here
-- silently kills the signal capture they exist for. Neither insert reads its
-- row back, so INSERT alone is sufficient — and there is deliberately no
-- SELECT policy, so the client can never read the responses.
revoke all on table public.upgrade_intents from public, anon, authenticated, service_role;
grant insert on table public.upgrade_intents to anon, authenticated;

revoke all on table public.feature_intents from public, anon, authenticated, service_role;
grant insert on table public.feature_intents to anon, authenticated;

-- ── Wellness ────────────────────────────────────────────────────────────────

revoke all on table public.wellness_items from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.wellness_items to authenticated;

-- wellness_logs: append-only by design — no UPDATE policy exists either.
revoke all on table public.wellness_logs from public, anon, authenticated, service_role;
grant select, insert, delete on table public.wellness_logs to authenticated;

revoke all on table public.quit_habits from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.quit_habits to authenticated;

-- quit_checkins: append-only — a check-in is a fact about a day that happened.
revoke all on table public.quit_checkins from public, anon, authenticated, service_role;
grant select, insert, delete on table public.quit_checkins to authenticated;

-- ── Owner-managed content ───────────────────────────────────────────────────

revoke all on table public.user_templates from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.user_templates to authenticated;

revoke all on table public.vision_cards from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.vision_cards to authenticated;

revoke all on table public.mind_maps from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.mind_maps to authenticated;

revoke all on table public.user_challenges from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.user_challenges to authenticated;

revoke all on table public.journal_entries from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.journal_entries to authenticated;

-- ── Money ───────────────────────────────────────────────────────────────────
--
-- Re-stated verbatim from 20260801160000 and 20260801150000 so this file is the
-- COMPLETE contract and its end state does not depend on application order.
-- The values are identical; db-tests pin the final matrix, so a future edit to
-- either file that disagrees with this one fails rather than drifts.

-- billing: SELECT for the browser's own-row read (usePlan + the data export)
-- and for the three direct server reads. NO write for anybody — every write
-- goes through the SECURITY DEFINER functions that own the event ordering, the
-- downgrade rules and the row lock.
revoke all on table public.billing from public, anon, authenticated, service_role;
grant select on table public.billing to authenticated;
grant select on table public.billing to service_role;

-- checkout_attempts: nothing to anybody. Every access is a SECURITY DEFINER
-- function running as the table owner, which is what makes that boundary real.
-- A client that could read this could read another user's Checkout Session id.
revoke all on table public.checkout_attempts from public, anon, authenticated, service_role;
