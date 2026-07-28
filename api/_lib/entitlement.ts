import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveEffectivePlan, type Plan } from '../../src/features/billing/planCore.js'

/**
 * SERVER-SIDE entitlement. The client has its own `usePlan()`, but a client gate
 * is a UX affordance, not a security control — so every Pro-only endpoint
 * resolves the plan again here, from the database.
 *
 * Deliberately does NOT pass `override`: that value comes from the browser's
 * localStorage (`todonado.plan`), so honouring it server-side would let anyone
 * grant themselves Pro from devtools. A developer previewing Pro locally will
 * therefore still get 403 from Pro-only endpoints — correct, and documented.
 */
export async function resolveServerPlan(
  admin: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<Plan> {
  let billingPlan: Plan | null = null
  try {
    const { data } = await admin
      .from('billing')
      .select('plan')
      .eq('user_id', userId)
      .maybeSingle()
    const value = (data as { plan?: string } | null)?.plan
    if (value === 'pro' || value === 'free') billingPlan = value
  } catch {
    // Billing unreadable (table missing / transient) → fall back to the founding
    // allowlist, exactly like the client does. Never fail open to Pro.
  }
  return resolveEffectivePlan({ billingPlan, email })
}
