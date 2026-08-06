/**
 * THE ONE PLACE THAT DECIDES WHAT A PRICE LOOKS LIKE ON SCREEN.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * The public pricing page displayed "$6 /mo · per month, billed yearly" while
 * Stripe was configured and live-tested at $5/month and $48/year. Those two
 * numbers had no connection to each other: `plans.ts` carried a PRICING
 * HYPOTHESIS written before Stripe existed, when the paid CTAs only recorded
 * willingness-to-pay, and nothing updated it when real prices were configured.
 * A visitor was quoted a number the product does not charge.
 *
 * So the amounts live here, once, and every surface reads them.
 *
 * ── WHAT THIS FILE IS NOT ──────────────────────────────────────────────────
 *
 * IT DOES NOT SELECT THE STRIPE PRODUCT, and that separation is deliberate.
 * `src/features/billing/stripeConfig.ts` owns the Stripe Price IDs, which come
 * from `VITE_STRIPE_PRICE_MONTHLY` / `VITE_STRIPE_PRICE_YEARLY` and are what
 * Checkout is actually charged against. The values below only DESCRIBE those
 * prices to a human.
 *
 * Keeping them apart is what stops a copy edit from changing what a customer
 * is billed, and stops an env change from silently rewriting marketing copy.
 * The cost is that the two can drift; the mitigation is that this file states
 * the amounts in exactly one place, and `pricingConsistency.test.ts` pins them.
 *
 * NOTHING HERE IS A SECRET. Amounts are public marketing facts.
 *
 * ── EVERYTHING DERIVED IS DERIVED ──────────────────────────────────────────
 *
 * Only the two amounts Stripe charges are written down. The annual monthly
 * equivalent, the saving and the percentage are COMPUTED, so the annual card
 * can never say "$48/month", "$4/year" or a stale discount: there is no second
 * number to fall out of step with the first.
 */

/** USD charged per month on the monthly plan. Stripe: VITE_STRIPE_PRICE_MONTHLY. */
export const PRO_MONTHLY_USD = 5

/** USD charged once per year on the annual plan. Stripe: VITE_STRIPE_PRICE_YEARLY. */
export const PRO_YEARLY_USD = 48

/** What twelve monthly payments would cost. */
export const PRO_MONTHLY_TWELVE_USD = PRO_MONTHLY_USD * 12

/**
 * The annual plan expressed per month: 48 / 12 = 4.
 *
 * ONLY EVER SHOWN NEXT TO "billed annually". A bare "$4/month" would be a
 * price the product does not offer, and is the exact mislabelling this module
 * exists to make impossible.
 */
export const PRO_YEARLY_PER_MONTH_USD = PRO_YEARLY_USD / 12

/** 60 - 48 = 12 USD saved per year by paying annually. */
export const PRO_YEARLY_SAVING_USD = PRO_MONTHLY_TWELVE_USD - PRO_YEARLY_USD

/** 12 / 60 = 20%. Rounded, because a percentage with decimals reads as noise. */
export const PRO_YEARLY_SAVING_PERCENT = Math.round(
  (PRO_YEARLY_SAVING_USD / PRO_MONTHLY_TWELVE_USD) * 100,
)

/**
 * Format a USD amount for display.
 *
 * Whole amounts lose the decimals ("$5", not "$5.00") because every price this
 * product charges is whole; the cents branch exists so a future non-whole price
 * degrades to "$4.50" instead of "$4.5".
 */
export function usd(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`
}

/**
 * The exact strings the UI renders.
 *
 * Centralised so the pricing page, the landing teaser and the authenticated
 * plan page cannot word the same fact three different ways — which is how the
 * old card ended up saying "/mo · per month, billed yearly", stating the period
 * twice and contradicting the plan it was on.
 */
export const PRO_PRICE_COPY = {
  /** "$5" */
  monthlyAmount: usd(PRO_MONTHLY_USD),
  /** "/month" */
  monthlySuffix: '/month',
  /** "$48" */
  yearlyAmount: usd(PRO_YEARLY_USD),
  /** "/year" */
  yearlySuffix: '/year',
  /** "$4/month billed annually" — the equivalent, never shown bare. */
  yearlyPerMonth: `${usd(PRO_YEARLY_PER_MONTH_USD)}/month billed annually`,
  /** "Save $12 a year (20%)" */
  yearlySaving: `Save ${usd(PRO_YEARLY_SAVING_USD)} a year (${PRO_YEARLY_SAVING_PERCENT}%)`,
  /*
   * One line covering the whole annual offer.
   *
   * Separated with a middot, not a long dash: the repo forbids em/en dashes in
   * anything a user reads (src/test/noLongDashes.test.ts), and the middot is
   * already the separator the marketing copy uses elsewhere.
   */
  yearlySummary: `or ${usd(PRO_YEARLY_USD)}/year · ${usd(PRO_YEARLY_PER_MONTH_USD)}/month billed annually, save ${PRO_YEARLY_SAVING_PERCENT}%`,
} as const

/** Structured annual pricing, for a card that renders the parts itself. */
export interface YearlyPricing {
  totalUsd: number
  perMonthUsd: number
  savingUsd: number
  savingPercent: number
}

export const PRO_YEARLY: YearlyPricing = {
  totalUsd: PRO_YEARLY_USD,
  perMonthUsd: PRO_YEARLY_PER_MONTH_USD,
  savingUsd: PRO_YEARLY_SAVING_USD,
  savingPercent: PRO_YEARLY_SAVING_PERCENT,
}
