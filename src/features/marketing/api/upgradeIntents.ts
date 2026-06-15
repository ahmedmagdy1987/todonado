import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { PaidTier } from '../plans'

/**
 * Fake-door intent capture: a paid-plan CTA records a willingness-to-pay signal
 * (and optional email) into `upgrade_intents`. NO Stripe, NO entitlement — this
 * only measures demand before any billing is built. See the migration
 * supabase/migrations/20260615120000_upgrade_intents.sql.
 */

export interface UpgradeIntentInput {
  tier: PaidTier
  userId?: string | null
  email?: string | null
  /** Where the click came from, e.g. 'pricing' or 'landing'. */
  source?: string | null
}

export interface UpgradeIntentRow {
  tier: PaidTier
  user_id: string | null
  email: string | null
  source: string | null
}

/** The minimal slice of the Supabase client this needs (keeps it unit-testable). */
type DbClient = Pick<SupabaseClient, 'from'>

/** Basic email shape check — good enough to gate the fake-door submit. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** Normalize a fake-door upgrade click into the row we persist. Pure + tested. */
export function buildUpgradeIntent(input: UpgradeIntentInput): UpgradeIntentRow {
  const email = input.email?.trim().toLowerCase()
  return {
    tier: input.tier,
    user_id: input.userId ?? null,
    email: email ? email : null,
    source: input.source ?? null,
  }
}

/**
 * Record a willingness-to-pay signal. Inserts WITHOUT .select(): the table has
 * no SELECT policy (intents are write-only from the client), so reading the row
 * back would fail RLS.
 */
export async function recordUpgradeIntent(
  client: DbClient,
  input: UpgradeIntentInput,
): Promise<void> {
  const { error } = await client.from('upgrade_intents').insert(buildUpgradeIntent(input))
  if (error) throw error
}

/** App-wired convenience using the shared Supabase client. */
export function captureUpgradeIntent(input: UpgradeIntentInput): Promise<void> {
  return recordUpgradeIntent(supabase, input)
}
