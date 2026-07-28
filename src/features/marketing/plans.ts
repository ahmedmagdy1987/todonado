/**
 * PRICING HYPOTHESIS — UNVALIDATED. This is the SINGLE source of truth for the
 * landing + pricing pages and the fake-door tiers. Edit tiers / prices / copy
 * HERE. See docs/PRODUCT_AUDIT.md §6 and docs/READINESS_CHECKLIST.md (D6/D11).
 *
 * Nothing is charged yet: the paid CTAs only record willingness-to-pay
 * (see ./api/upgradeIntents.ts) — the whole point is to test these numbers
 * BEFORE building Stripe.
 */

/** Tiers a user can express purchase intent for. MUST match the DB check in
 *  supabase/migrations/20260615120000_upgrade_intents.sql (tier in ('pro','team')). */
import { FREE_HISTORY_DAYS } from '@/lib/config'

export type PaidTier = 'pro' | 'team'
export type PlanId = 'free' | PaidTier

export interface Plan {
  id: PlanId
  name: string
  tagline: string
  /** USD per month, billed annually. 0 = free, null = no fixed price yet. */
  priceMonthly: number | null
  priceNote: string
  cta: string
  /** Visually highlighted as the recommended plan. */
  featured?: boolean
  /** Not available yet — the CTA only captures intent. */
  comingSoon?: boolean
  /** Plain-language features, grounded in what the app actually ships today. */
  features: string[]
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Capture and organize everything.',
    priceMonthly: 0,
    priceNote: 'Free forever',
    cta: 'Start free',
    features: [
      'Unlimited task capture (Inbox)',
      'Projects, sections & subtasks',
      'Drag-to-reorder & priorities',
      // Templated from the constant so the copy can never drift from behaviour.
      `Completed history for the last ${FREE_HISTORY_DAYS} days`,
      'A basic Today list with manual scheduling',
      'Dark, installable PWA',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Plan a realistic day, every day.',
    priceMonthly: 6,
    priceNote: 'per month, billed yearly',
    cta: 'Start Pro',
    featured: true,
    features: [
      'Effort-aware capacity meter: plan what actually fits',
      'Overbooking guard + one-tap roll-over & recovery',
      'Focus mode: a distraction-free deep-work timer',
      'Recurring tasks (daily / weekly / monthly / yearly)',
      'Unlimited history — every completed task, kept forever',
      'Insights: planned-vs-actual effort & focus trends',
      'Everything in Free, unlimited',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'Shared workspaces for small teams.',
    priceMonthly: null,
    priceNote: 'Coming soon',
    cta: 'Get notified',
    comingSoon: true,
    features: [
      'Everything in Pro',
      'Shared workspaces & members',
      'Team capacity & planning',
      'Roles & permissions',
    ],
  },
]

export const PRICING_DISCLAIMER =
  'Prices are an early hypothesis we’re still validating, and nothing is charged yet. Pick a paid plan to get notified at launch.'
