/**
 * Client-side Stripe config (the ONLY billing config visible to the browser).
 *
 * All three are optional build-time env vars. When they are ABSENT the app runs
 * exactly as before — the "Upgrade" CTA falls back to the fake-door
 * UpgradeIntentModal (see isBillingConfigured / PlanPage). Real Stripe keys are
 * pure configuration added later in Vercel; NO code change is needed to switch on.
 *
 * The publishable key + price IDs are PUBLIC (safe in the client bundle). The
 * secret key, webhook secret, and service-role key are SERVER-only (Vercel env,
 * never VITE_, never committed) — see api/_lib/config.ts and docs/BILLING_SETUP.md.
 */

export interface StripeClientConfig {
  publishableKey: string
  priceMonthly: string
  priceYearly: string
}

/** Reads the VITE_ vars (empty string when unset). */
export const STRIPE_CONFIG: StripeClientConfig = {
  publishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '',
  priceMonthly: import.meta.env.VITE_STRIPE_PRICE_MONTHLY ?? '',
  priceYearly: import.meta.env.VITE_STRIPE_PRICE_YEARLY ?? '',
}

/** Pure detector — true only when every client-side Stripe value is present. */
export function isBillingConfiguredFrom(config: StripeClientConfig): boolean {
  return Boolean(config.publishableKey && config.priceMonthly && config.priceYearly)
}

/** Whether real Stripe checkout is wired (else the fake-door fallback is used). */
export function isBillingConfigured(): boolean {
  return isBillingConfiguredFrom(STRIPE_CONFIG)
}

export type BillingInterval = 'monthly' | 'yearly'

/** The Stripe price ID for the chosen billing interval. */
export function priceIdFor(interval: BillingInterval, config: StripeClientConfig = STRIPE_CONFIG): string {
  return interval === 'yearly' ? config.priceYearly : config.priceMonthly
}
