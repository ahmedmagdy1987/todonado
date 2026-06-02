-- ============================================================================
--  Todonado — first-run onboarding flag
--  Additive. New profiles default to false (show onboarding once); existing
--  profiles are marked complete so already-active users aren't re-onboarded.
-- ============================================================================

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

-- Existing users are already active — don't show them the first-run flow.
update public.profiles set onboarding_completed = true where onboarding_completed = false;
