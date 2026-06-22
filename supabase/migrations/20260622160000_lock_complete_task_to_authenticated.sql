-- ============================================================================
--  Todonado — audit follow-up F1: lock complete_task to authenticated only
--
--  docs/AUDIT_2026-06-22_followup.md (F1): the revoke/grant block in
--  20260622140000 never took effect on the live DB (likely the function was
--  created/replaced without the trailing grants — `create or replace function`
--  does NOT reset PUBLIC's default EXECUTE). So PUBLIC, hence `anon`, still holds
--  EXECUTE on complete_task. It is RLS-contained (the function is SECURITY
--  INVOKER, so anon's null auth.uid() sees zero rows — no read/write/oracle,
--  confirmed by live probe), but anon has no business calling it. Re-assert least
--  privilege in a dedicated, idempotent migration so it actually lands.
--
--  This changes ONLY the execute grant — NOT the function body or any RLS policy.
--  The authenticated client path is unaffected: `authenticated` keeps EXECUTE, so
--  src/features/tasks/api/completeTask.ts's `rpc('complete_task', …)` (called with
--  the signed-in user's JWT) continues to work exactly as before.
--
--  Idempotent: re-running is a no-op. Safe to run alongside 20260622140000.
-- ============================================================================

revoke all on function public.complete_task(uuid, jsonb) from public;
revoke all on function public.complete_task(uuid, jsonb) from anon;
grant  execute on function public.complete_task(uuid, jsonb) to authenticated;
