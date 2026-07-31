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
import {
  FREE_HISTORY_DAYS,
  FREE_PERSONAL_TEMPLATES,
  FREE_QUIT_HABITS,
  FREE_VISION_CARDS,
} from '@/lib/config'

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
    tagline: 'The whole daily loop: plan, focus, recover.',
    priceMonthly: 0,
    priceNote: 'Free forever',
    cta: 'Start free',
    // ORDER MATTERS: PricingTeaser shows only the first BULLET_LIMIT of these,
    // so the strongest true lines lead.
    features: [
      'The effort-aware capacity meter: the whole idea, free',
      'Overbooking guard, one-tap roll-over & recovery',
      '“Plan my day”: one press fills today without going over',
      'Focus mode with Pomodoro, and one-tap “Get to work”',
      'Unlimited capture: projects, sections, subtasks, priorities',
      'Recurring tasks (daily / weekly / monthly / yearly)',
      'A catalog of effort-tagged templates & checklists',
      'Daily briefing: what carried over and what’s free today',
      // Templated from the constants so the copy can never drift from behaviour.
      `${FREE_PERSONAL_TEMPLATES} personal templates · ${FREE_QUIT_HABITS} quit habit · ${FREE_VISION_CARDS} vision goals`,
      'Breathwork, and a supplement & medication log',
      `Completed history for the last ${FREE_HISTORY_DAYS} days`,
      'Calendar import (.ics file)',
      'Dark, installable PWA',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'The week ahead, and what your days are telling you.',
    priceMonthly: 6,
    priceNote: 'per month, billed yearly',
    cta: 'Start Pro',
    featured: true,
    /*
     * EVERY LINE HERE IS A REAL `usePlan()` GATE IN THE CODE — nothing else.
     *
     * This list used to claim the capacity meter, the overbooking guard,
     * roll-over, focus mode and recurring tasks. All five are FREE and always
     * have been, which made the Free column read as "a basic Today list" and the
     * Pro column read as a paywall around the thing the product is for. The
     * honest split is narrower and easier to defend: the day is free, the WEEK
     * and the RETROSPECTIVE are paid.
     */
    features: [
      'Week planning: 7 days of capacity, drag between days + “Plan my week”',
      'Insights: planned-vs-actual, estimation accuracy, focus & weekly trends',
      'Smart daily briefing: a ready-made plan, an estimation nudge & priority alerts',
      'Unlimited history: every completed task, kept forever',
      'Live calendar sync (URL): paste a link once, meetings stay fresh daily',
      'Unlimited personal templates & checklists',
      'Unlimited quit habits and vision goals',
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
