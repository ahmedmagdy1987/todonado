/**
 * THE PUBLIC MARKETING SURFACE, AND WHAT EACH PAGE TELLS A CRAWLER.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * Every public route was served the same `index.html`, so every one of them
 * carried the SAME title, the SAME description and — worst of all — the SAME
 * canonical, `https://www.todonado.com/`. A canonical is not a hint that a page
 * is related to another one; it is a declaration that this URL IS that one. The
 * live site was telling Google that /pricing, /about, /terms and /privacy were
 * all duplicates of the homepage and should not be indexed in their own right.
 *
 * So the routes are listed once, here, with the metadata each one actually
 * deserves, and the prerender step writes a real HTML file per route.
 *
 * ── THE RULES FOR ANYTHING ADDED BELOW ─────────────────────────────────────
 *
 * 1. PUBLIC ONLY. Nothing behind ProtectedRoute goes in this list. The
 *    prerenderer renders whatever is here, and an authenticated route would
 *    either render a loading state or, worse, leak a shape of the app that
 *    signed-out visitors are not meant to see.
 * 2. The description must be true and must describe THAT page. A generic
 *    company blurb repeated six times is what this file replaces.
 * 3. Amounts are never written here. Pricing copy lives in `../features/
 *    marketing/pricing.ts`, which is the single source every surface reads, and
 *    a hardcoded "$5" in a meta description is exactly the drift that module
 *    exists to prevent.
 */
import { PRO_MONTHLY_USD, PRO_YEARLY_USD, usd } from '@/features/marketing/pricing'

export const SITE_ORIGIN = 'https://www.todonado.com'

export interface PrerenderRoute {
  /** The path react-router matches, and the file written under dist/. */
  path: string
  /** `<title>`. Route-specific; never the site name alone. */
  title: string
  /** `<meta name="description">`. One sentence, true, about this page. */
  description: string
  /**
   * The URL this page declares itself to be.
   *
   * `/` points at /welcome because the root is a gated redirect rather than a
   * page (see the note on the route below). Every other route is its own page
   * and says so, which is the whole correction: they all used to claim to be
   * the origin.
   */
  canonical: string
  /** Emit the SoftwareApplication + Organization JSON-LD on this page. */
  softwareApplicationLd?: boolean
  /**
   * The contract the BUILD enforces for this page.
   *
   * `scripts/prerender.mjs` fails the build if a route renders less visible
   * text than `minText`, or is missing any of `mustContain`. That is the whole
   * point: the failure this work exists to fix was a page that returned 200
   * with an empty body, which no type, lint or unit test can see. A silent
   * regression here would look exactly like success, so the check lives where
   * it can stop a deploy.
   *
   * `/` is exempt: it is a gated redirect and legitimately renders a loader.
   */
  minText?: number
  mustContain?: string[]
}

/**
 * The homepage title, written once because `/` and `/welcome` are one page.
 *
 * IT NAMES BOTH HALVES OF THE PRODUCT, which the title it replaces did not.
 * "Plan a realistic day, not a wish-list" described a planner and stopped
 * there; the landing that actually shipped plans the day AND then runs it in a
 * focus timer, and section 01 says so in as many words ("the plan is the thing
 * you work"). "Plan the day you actually have" still carries the words a person
 * types into a search box, without reducing the product to minute-counting.
 */
const HOME_TITLE = 'Todonado: plan the day you actually have, then work it'

export const PRERENDER_ROUTES: PrerenderRoute[] = [
  /*
   * `/` IS NOT THE MARKETING PAGE, AND THE OLD METADATA CLAIMED IT WAS.
   *
   * `/` sits inside ProtectedRoute. A signed-out visitor is redirected to
   * /welcome and a signed-in one gets their command center, so the root renders
   * a loader and then goes somewhere else. Every page on the site nonetheless
   * declared `canonical: https://www.todonado.com/`, pointing all of them at a
   * URL that shows no marketing copy to anyone.
   *
   * So the root keeps its real behaviour, untouched, and simply tells search
   * engines where the page actually is. /welcome is the canonical marketing
   * URL, carries the product structured data, and is what the sitemap lists.
   */
  {
    path: '/',
    title: HOME_TITLE,
    /*
     * A DIFFERENT SENTENCE FROM /welcome, DELIBERATELY.
     *
     * The two share a title because they are the same page to a reader, but a
     * description that merely paraphrases the canonical one is a wasted slot.
     * This one says what you DO; /welcome says what the thing IS.
     */
    description:
      'Open Todonado and plan the part of your list that fits today. Pick a task, start the timer, and afterwards see where the hours really went. Anything unfinished rolls into tomorrow.',
    canonical: `${SITE_ORIGIN}/welcome`,
  },
  {
    path: '/welcome',
    title: HOME_TITLE,
    /*
     * CATEGORY, DIFFERENTIATOR, BREADTH - in that order, and nothing else.
     *
     * "day planner" is the category a person searches for and there is no
     * reason to hide from it. What the old description did wrong was stop
     * there: it sold a capacity meter to people planning a work day, when the
     * page it describes opens on Work, Health, Family, Errands, Money and
     * Routines and then runs the day in a timer. So the category is stated
     * once, the differentiator qualifies it, and the breadth is named with the
     * hero's own domains rather than with a grand word standing in for them.
     */
    description:
      'Todonado is a day planner built around the time you really have. It covers work, health, family, errands and money, and runs the plan in a focus timer so you can see where the time went.',
    canonical: `${SITE_ORIGIN}/welcome`,
    softwareApplicationLd: true,
    /*
     * The floors below are set from what each page ACTUALLY renders, with
     * roughly a quarter of headroom, and they are the reason this file can be
     * trusted. `/welcome` renders about 11,650 characters; the day it renders
     * 8,000 something has silently stopped rendering, and the build should
     * stop rather than ship it.
     *
     * `mustContain` is the same idea for specific copy. "Most planners track
     * what you owe" sits in section 01, well below the fold, so it also proves
     * the lazily-imported route chunk resolved rather than emitting its
     * Suspense fallback.
     */
    minText: 8500,
    mustContain: [
      'Your list is infinite',
      'Your day is not',
      'Start free',
      'Most planners track what you owe',
      'Plan it, work it, learn from it',
    ],
  },
  {
    path: '/pricing',
    title: 'Todonado pricing: a complete free plan and what Pro adds',
    description: `A complete day is free forever. No trial to expire, and no credit card. Pro adds week planning, insights on planned versus real time and live calendar sync, for ${usd(
      PRO_MONTHLY_USD,
    )} a month or ${usd(PRO_YEARLY_USD)} a year.`,
    canonical: `${SITE_ORIGIN}/pricing`,
    minText: 4800,
    mustContain: [usd(PRO_MONTHLY_USD), usd(PRO_YEARLY_USD), 'Free forever'],
  },
  {
    path: '/about',
    title: 'About Todonado: an honest plan of what actually fits',
    description:
      'Why Todonado exists and who it is for. Most planners track what you owe; this one starts from the time you actually have, so you commit to a day you can finish.',
    canonical: `${SITE_ORIGIN}/about`,
    minText: 900,
  },
  {
    path: '/terms',
    /*
     * "Terms of Use", because that is the heading on the page. A title that
     * says "Terms of Service" over a page headed "Terms of Use" is a small lie
     * that costs nothing to avoid.
     */
    title: 'Terms of Use | Todonado',
    /*
     * WRITTEN FROM THE PAGE, NOT FROM WHAT A TERMS PAGE USUALLY CONTAINS.
     *
     * A first draft of this line advertised "billing and cancellation". The
     * document contains no such section: the words billing, subscription,
     * payment, cancel and refund do not appear on it at all. Its actual
     * headings are the account, acceptable use, the wellbeing tools not being
     * medical advice, as-is service, liability, and changes. Those are what it
     * now describes.
     */
    description:
      'The terms for using Todonado: your account, acceptable use, why the wellbeing tools are not medical advice, and what we do and do not promise about the service.',
    canonical: `${SITE_ORIGIN}/terms`,
    minText: 2000,
  },
  {
    path: '/privacy',
    title: 'Privacy Policy | Todonado',
    /*
     * The earlier version of this line promised a data export. The policy
     * describes deletion, not export, and metadata is not the place to invent
     * a capability the product may not have.
     */
    description:
      'What Todonado collects, how it is used, and the choices you have. Covers your email, the tasks and notes you create, voice recordings, and the health-adjacent logs kept only for you.',
    canonical: `${SITE_ORIGIN}/privacy`,
    minText: 3800,
  },
]

/**
 * Structured data for the product.
 *
 * ── EVERY FIELD HERE IS A FACT THE SITE ALREADY STATES ─────────────────────
 *
 * There is deliberately NO `aggregateRating`, NO `reviewCount`, NO `review` and
 * NO user count. Todonado has no reviews yet, and inventing them is both a
 * Google structured-data policy violation and the precise kind of claim the
 * whole marketing surface has been audited to avoid. An empty product graph
 * that is true beats a rich one that is not.
 *
 * The offers come from `pricing.ts` for the same reason the meta description
 * does: there is one place that knows what Todonado charges.
 */
export function softwareApplicationJsonLd(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Todonado',
    url: `${SITE_ORIGIN}/`,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Task management and daily planning',
    // Browser-based and installable to a home screen; there is no app store
    // build, which is why no `operatingSystem` list is claimed beyond this.
    operatingSystem: 'Web browser',
    description:
      'A day planner built around the time you really have. Put minutes on the work, see what fits before you commit, run the plan in a focus timer, and carry forward whatever slips.',
    /*
     * THE OFFER DESCRIPTIONS ARE THE SHIPPING CONTRACT, NOT A PITCH.
     *
     * The Free line used to stop at the capacity meter and roll-over, which
     * was the Free tier of an earlier release. Free has since become a great
     * deal more generous (unlimited tasks, projects and subtasks, templates,
     * a month of completed history), and a structured-data blurb that
     * undersells the free plan is a worse error than one that oversells it:
     * it is the version a search result may quote.
     */
    offers: [
      {
        '@type': 'Offer',
        name: 'Free',
        price: '0',
        priceCurrency: 'USD',
        description:
          'Unlimited tasks, projects and subtasks, the capacity meter and overbooking warning, Plan my day, focus mode with Pomodoro, roll-over, recurring tasks, templates, and 30 days of completed history.',
      },
      {
        '@type': 'Offer',
        name: 'Pro, monthly',
        price: String(PRO_MONTHLY_USD),
        priceCurrency: 'USD',
        billingIncrement: 1,
        description:
          'Adds week planning, insights on planned versus real time, unlimited history, live calendar sync and voice notes in the journal.',
      },
      {
        '@type': 'Offer',
        name: 'Pro, yearly',
        price: String(PRO_YEARLY_USD),
        priceCurrency: 'USD',
        description: 'The same Pro plan billed once a year.',
      },
    ],
  })
}

/*
 * THERE IS DELIBERATELY NO FAQPage BLOCK, AND THE LANDING DOES HAVE AN FAQ.
 *
 * Google restricted FAQ rich results in August 2023 to well-known authoritative
 * government and health sites. For everybody else the markup is still valid and
 * still parsed, and it produces no rich result whatsoever. Adding it here would
 * be schema for the sake of having schema: more surface to keep in step with
 * the visible questions, a second place for the answers to drift, and nothing
 * gained. If that guidance changes, the visible FAQ already exists to describe
 * and this is where the block would go.
 */

/** The publisher, kept minimal because very little about it is public fact. */
export function organizationJsonLd(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Todonado',
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}/icons/apple-touch-icon.png`,
  })
}
