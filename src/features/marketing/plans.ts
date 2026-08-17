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

/**
 * The all-in-one claim, in category terms. ONE array, used by both surfaces.
 *
 * The landing strip and the pricing page each carried their own copy of this
 * list, with a comment on each saying they were "deliberately identical"
 * because "two surfaces saying slightly different things is how a claim stops
 * being checkable". They had drifted anyway: the landing listed six categories
 * and the pricing page four, so the same promise was two different sizes
 * depending on which page you read. A comment cannot hold an invariant that a
 * shared constant can.
 *
 * NO BRAND NAMES AND NO "REPLACES N APPS" — a number invites arithmetic nobody
 * wins, and naming competitors makes the page about them.
 */
export const ALL_IN_ONE_CATEGORIES = [
  'A day planner',
  'A focus & pomodoro timer',
  'A habit & quit tracker',
  'A breathing coach',
  'A journal',
  'A mind-map canvas',
] as const

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Everything you need to plan and finish a day.',
    priceMonthly: 0,
    priceNote: 'Free forever',
    cta: 'Start free',
    // ORDER MATTERS: PricingTeaser shows only the first BULLET_LIMIT of these,
    // so the strongest true lines lead.
    features: [
      'A capacity meter that shows what actually fits in your day',
      'A warning before you overbook, and one tap to move unfinished work to tomorrow',
      '“Plan my day”: one tap fills today without going over',
      'Focus mode with Pomodoro, and one-tap “Get to work”',
      'Unlimited tasks: projects, sections, subtasks, priorities',
      'Recurring tasks (daily / weekly / monthly / yearly)',
      'Ready-made templates and checklists, each with time estimates',
      'Daily briefing: what carried over and how much time you have left',
      // Templated from the constants so the copy can never drift from behaviour.
      // EVERY capped surface, not a selection of them. Mind maps and challenges
      // were both missing here while the app capped them at one each, so a Free
      // user met a limit the pricing page had never mentioned.
      `${FREE_PERSONAL_TEMPLATES} personal templates · ${FREE_QUIT_HABITS} quit habit · ${FREE_VISION_CARDS} vision goals`,
      `${FREE_MIND_MAPS} mind map · ${FREE_ACTIVE_CHALLENGES} challenge at a time · the daily journal, in text`,
      'Breathwork, and a supplement & medication log',
      /*
       * THE STREAK IS WINDOWED TOO, AND THIS LINE NEVER SAID SO.
       *
       * The planning streak is computed from day keys passed through the same
       * history window, so a Free user who has planned every day for three
       * months reads "14-day streak" indefinitely. Nobody would read
       * "completed history for the last 14 days" as "and your streak counter
       * stops there", so the omission was doing real work. Stated plainly here
       * until the streak itself is fixed (proposed as E4 in
       * docs/PRODUCT_VALUE_AUDIT.md, deliberately not implemented in the same
       * change as the copy that discloses it).
       */
      `Completed history and planning streak for the last ${FREE_HISTORY_DAYS} days · nothing is ever deleted`,
      'Calendar import (.ics file)',
      // Was "Dark, installable PWA". Three jargon words for one ordinary fact.
      'Works on your phone and laptop, no app store',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'See the week ahead, and how your days really go.',
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
      'Insights: planned time vs. real time, estimate accuracy, and focus trends',
      'Smart daily briefing: your day already planned, with priority and estimate reminders',
      /*
       * THIS LINE USED TO READ "every completed task, kept forever".
       *
       * A product audit on 2026-08-17 flagged it as the single most damaging
       * claim on the page, because it implies Free DELETES your work. It never
       * has: `FREE_HISTORY_DAYS` is a filter in the view layer over rows that
       * are already in the user's own browser cache, so upgrading reveals them
       * on the next render with no refetch. Selling the return of something
       * that was never taken away is the kind of claim that costs trust in the
       * other eight bullets. The words "Unlimited history" stay, because the
       * feature is real and it is genuinely what Pro adds.
       */
      `Unlimited history: your whole record stays in view, not just the last ${FREE_HISTORY_DAYS} days. Nothing is ever deleted on either plan`,
      'Live calendar sync: paste your calendar link once and meetings update daily',
      'Unlimited personal templates & checklists',
      'Unlimited quit habits, vision goals, mind maps and challenges',
      'Voice notes in the daily journal',
      /*
       * "Everything in Free, unlimited" was here and is deliberately gone.
       *
       * It mapped to NO gate anywhere in the code, and it restated two of the
       * bullets directly above it. On a list of nine, one line that means
       * nothing is one ninth of the pitch spent saying nothing.
       */
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
