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
    title: 'Todonado: your list is infinite, your day is not',
    description:
      'A day holds only so many minutes. Todonado gives every task the time it really takes, shows you what fits before you commit, then helps you focus and pick up whatever slips.',
    canonical: `${SITE_ORIGIN}/welcome`,
  },
  {
    path: '/welcome',
    title: 'Todonado: your list is infinite, your day is not',
    description:
      'A day holds only so many minutes. Todonado gives every task the time it really takes, shows you what fits before you commit, then helps you focus and pick up whatever slips.',
    canonical: `${SITE_ORIGIN}/welcome`,
    softwareApplicationLd: true,
    minText: 4000,
    mustContain: ['Your list is infinite', 'Your day is not', 'Start free', 'One place for your day'],
  },
  {
    path: '/pricing',
    title: 'Pricing: free for every day, Pro for the whole week | Todonado',
    description: `The capacity meter, planning, focus mode and roll-over are free forever. Pro adds week planning and insights for ${usd(
      PRO_MONTHLY_USD,
    )} a month or ${usd(PRO_YEARLY_USD)} a year.`,
    canonical: `${SITE_ORIGIN}/pricing`,
    minText: 3000,
    mustContain: [usd(PRO_MONTHLY_USD), usd(PRO_YEARLY_USD)],
  },
  {
    path: '/about',
    title: 'About Todonado',
    description:
      'Why Todonado exists, what it refuses to do, and who is building it. A daily planner that is honest about how much time a day actually has.',
    canonical: `${SITE_ORIGIN}/about`,
    minText: 600,
  },
  {
    path: '/terms',
    title: 'Terms of Use | Todonado',
    description: 'The terms that apply when you use Todonado.',
    canonical: `${SITE_ORIGIN}/terms`,
    minText: 1200,
  },
  {
    path: '/privacy',
    title: 'Privacy Policy | Todonado',
    description:
      'What Todonado stores, what it never sells, and how to export or permanently delete your account and its data.',
    canonical: `${SITE_ORIGIN}/privacy`,
    minText: 1200,
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
      'A daily planner that counts the minutes. Give every task the time it really takes, see what fits before you commit, focus on it, and carry forward whatever slips.',
    offers: [
      {
        '@type': 'Offer',
        name: 'Free',
        price: '0',
        priceCurrency: 'USD',
        description:
          'The capacity meter, the overbooking warning, Plan my day, focus mode with Pomodoro, roll-over and recurring tasks.',
      },
      {
        '@type': 'Offer',
        name: 'Pro, monthly',
        price: String(PRO_MONTHLY_USD),
        priceCurrency: 'USD',
        billingIncrement: 1,
        description: 'Adds week planning, insights, unlimited history and live calendar sync.',
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
