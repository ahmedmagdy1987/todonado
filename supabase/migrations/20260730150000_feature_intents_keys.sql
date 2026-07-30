-- ============================================================================
--  Todonado — widen feature_intents.feature_key
--
--  `feature_intents` is the insert-only fake door: a user taps "I'd want this",
--  one row is written, and the client can never read it back (there is
--  deliberately no select/update/delete policy). The allowed keys are pinned by
--  a CHECK, which is the right call — it stops a typo'd key quietly becoming its
--  own bucket and splitting the demand signal for a feature in two.
--
--  It also means a NEW fake door needs this migration. Four are being added, one
--  per thing that is genuinely deferred rather than half-built:
--
--    'vision_images' — image / photo vision boards. Deferred on a real product
--                      question, not a technical one: images mean a storage
--                      bucket, upload limits, a storage RLS policy, thumbnails
--                      and a bill. The text-first Vision page ships now and this
--                      measures whether the pictures are actually wanted.
--    'referral'      — referral rewards and discount codes. Blocked on Stripe
--                      going LIVE (promotion codes, a referrals table,
--                      attribution). Until then the app offers a plain shareable
--                      link, which works today, and promises nothing.
--    'ai_coach'      — the coaching / suggestion layer. Blocked on an AI API
--                      being provisioned; CLAUDE.md §5 lists AI features as
--                      out of scope until explicitly prioritised.
--    'voice_journal' — spoken journal entries with analysis. Same blocker.
--
--  Every one of these has a shipped, honest non-AI core behind it — the fake
--  door is measuring the ADDITIONAL layer, never standing in for a feature the
--  UI implies already exists.
--
--  Nothing else changes: same table, same insert-only RLS, same absence of a
--  read path. The existing three keys are preserved exactly.
--
--  The original constraint was declared INLINE and unnamed, so Postgres called
--  it `feature_intents_feature_key_check`. It is dropped by that name and
--  re-added widened — the repo's additive-CHECK idiom (see
--  20260623130000_events_auto_planned.sql). Idempotent: dropping with
--  `if exists` and re-adding the same name is a no-op on a second push.
-- ============================================================================

alter table public.feature_intents
  drop constraint if exists feature_intents_feature_key_check;

alter table public.feature_intents
  add constraint feature_intents_feature_key_check check (feature_key in (
    -- Focus & Calm concepts (all three now SHIPPED; the keys stay so the
    -- historical rows they collected remain valid).
    'meditation',
    'sleep_sounds',
    'supplement_tracker',
    -- Deferred layers, each with a shipped non-AI / non-Stripe core.
    'vision_images',
    'referral',
    'ai_coach',
    'voice_journal'
  ));
