import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { FeatureKey, NewFeatureIntentInput } from '@/types/database'

/**
 * Fake-door interest capture for the "Focus & Calm" wellness angle: a "Notify me"
 * click on a NOT-YET-BUILT concept records a demand signal into `feature_intents`.
 * NO feature, NO content, NO audio — this only measures interest before we decide
 * whether to build any of it. See the migration
 * supabase/migrations/20260622120000_feature_intents.sql. Sibling to the
 * upgrade_intents (willingness-to-pay) fake-door; same insert-only RLS model.
 */

export interface FeatureIntentInput {
  featureKey: FeatureKey
  /** Signed-in user's id, or null for a logged-out landing visitor. */
  userId?: string | null
  /** Where the click came from, e.g. 'wellness' or 'landing'. */
  source?: string | null
}

/** The minimal slice of the Supabase client this needs (keeps it unit-testable). */
type DbClient = Pick<SupabaseClient, 'from'>

/** Normalize a "Notify me" click into the row we persist. Pure + tested. */
export function buildFeatureIntent(input: FeatureIntentInput): NewFeatureIntentInput {
  return {
    feature_key: input.featureKey,
    user_id: input.userId ?? null,
    source: input.source ?? null,
  }
}

/**
 * Record an interest signal. Inserts WITHOUT .select(): the table has no SELECT
 * policy (write-only from the client), so reading the row back would fail RLS.
 */
export async function recordFeatureIntent(
  client: DbClient,
  input: FeatureIntentInput,
): Promise<void> {
  const { error } = await client.from('feature_intents').insert(buildFeatureIntent(input))
  if (error) throw error
}

/** App-wired convenience using the shared Supabase client. */
export function captureFeatureIntent(input: FeatureIntentInput): Promise<void> {
  return recordFeatureIntent(supabase, input)
}
