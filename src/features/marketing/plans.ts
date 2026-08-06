/**
 * Tiers, copy and feature lists for the landing + pricing pages.
 *
 * ── PRO'S AMOUNTS ARE NOT WRITTEN HERE ANY MORE ────────────────────────────
 *
 * They come from ./pricing.ts, which is the single source of truth for every
 * displayed amount. This file used to carry a PRICING HYPOTHESIS from before
 * Stripe existed — `priceMonthly: 6, priceNote: 'per month, billed yearly'` —
 * written when the paid CTAs only recorded willingness-to-pay. Stripe was then
 * configured at $5/month and $48/year and nothing updated this file, so the
 * public page quoted a number the product does not charge.
 *
 * Free and Team have no Stripe price and keep their literal values: 0 and null
 * are states, not amounts.
 *
 * See docs/PRODUCT_AUDIT.md §6 and docs/READINESS_CHECKLIST.md (D6/D11).
 */

/** Tiers a user can express purchase intent for. MUST match the DB check in
 *  supabase/migrations/20260615120000_upgrade_intents.sql (tier in ('pro','team')). */
import {
  FREE_ACTIVE_CHALLENGES,
  FREE_HISTORY_DAYS,
  FREE_MIND_MAPS,
  FREE_PERSONAL_TEMPLATES,
  FREE_QUIT_HABITS,
  FREE_VISION_CARDS,
} from '@/lib/config'
import { PRO_MONTHLY_USD, PRO_PRICE_COPY, PRO_YEARLY, type YearlyPricing } from './pricing'

export type PaidTier = 'pro' | 'team'
export type PlanId = 'free' | PaidTier

export interface Plan {
  id: PlanId
  name: string
  tagline: string
  /**
   * Headline USD amount, charged PER MONTH on the monthly plan.
   * 0 = free, null = no fixed price yet.
   *
   * It is the monthly price, not an annualised one. The old field meant "per
   * month, billed annually", which is why the card said "$6 /mo · per month,
   * billed yearly" — a monthly figure wearing an annual label.
   */
  priceMonthly: number | null
  priceNote: string
  /**
   * The annual alternative, when the plan has one. Present ⇒ the card renders
   * the annual line; absent ⇒ it cannot, so Free and Team can never sprout a
   * bogus "billed annually".
   */
  yearly?: YearlyPricing
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
      // EVERY capped surface, not a selection of them. Mind maps and challenges
      // were both missing here while the app capped them at one each, so a Free
      // user met a limit the pricing page had never mentioned.
      `${FREE_PERSONAL_TEMPLATES} personal templates · ${FREE_QUIT_HABITS} quit habit · ${FREE_VISION_CARDS} vision goals`,
      `${FREE_MIND_MAPS} mind map · ${FREE_ACTIVE_CHALLENGES} challenge at a time · the daily journal, in text`,
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
    priceMonthly: PRO_MONTHLY_USD,
    priceNote: 'per month',
    yearly: PRO_YEARLY,
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
      'Unlimited quit habits, vision goals, mind maps and challenges',
      'Voice notes in the daily journal',
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

/**
 * The line above the plan cards.
 *
 * It used to read "Prices are an early hypothesis we're still validating, and
 * nothing is charged yet. Pick a paid plan to get notified at launch." That was
 * written when the paid CTAs only recorded interest and there was no Stripe
 * account behind them. Stripe is configured now and the page quotes the real
 * amounts, so calling them a hypothesis undercut the numbers beside it and told
 * a visitor the opposite of what the product does.
 *
 * The amount is NOT written here: it comes from ./pricing.ts, so this sentence
 * and the cards below it cannot quote different figures.
 */
export const PRICING_DISCLAIMER = `Start free. Upgrade to Pro anytime from your plan settings. ${PRO_PRICE_COPY.sentence}`
