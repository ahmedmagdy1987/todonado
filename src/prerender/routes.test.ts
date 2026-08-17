import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  PRERENDER_ROUTES,
  SITE_ORIGIN,
  softwareApplicationJsonLd,
  organizationJsonLd,
} from './routes'
import { PRO_MONTHLY_USD, PRO_YEARLY_USD } from '@/features/marketing/pricing'

/**
 * THE THREE FILES THAT DESCRIBE THE SITE TO A CRAWLER MUST AGREE.
 *
 * `routes.ts` decides which pages are prerendered and what each one claims to
 * be; `sitemap.xml` submits a list of URLs; `robots.txt` says which may be
 * fetched. Nothing links them, so adding a marketing page means editing three
 * files, and the failure mode of forgetting one is invisible: the page still
 * works, still deploys, and is simply never found.
 *
 * These run in the unit suite rather than at build time on purpose. The build
 * already enforces that each page RENDERS (scripts/prerender.mjs), and the CSP
 * suite enforces what the SERVER hands back; this is the cheap, instant check
 * that the three descriptions are consistent before either of those runs.
 */

// Newlines are normalised because the assertions below are line-anchored, and a
// CRLF checkout would otherwise make a real "allowed and disallowed" collision
// silently pass.
const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').split('\r\n').join('\n')
const SITEMAP = read('../../public/sitemap.xml')
const ROBOTS = read('../../public/robots.txt')

/** Every route except the root, which is a gated redirect rather than a page. */
const PAGES = PRERENDER_ROUTES.filter((r) => r.path !== '/')

describe('the public route table', () => {
  it('gives every page its own canonical, absolute and self-referencing', () => {
    for (const route of PAGES) {
      expect(route.canonical, `${route.path} canonical must be absolute`).toMatch(
        /^https:\/\/www\.todonado\.com\//,
      )
      /*
       * The defect this replaces: every page shipped `canonical: .../`, which
       * does not mean "related to the homepage" — it declares this URL IS that
       * one, and asks Google not to index it separately.
       */
      expect(route.canonical, `${route.path} must declare itself, not another page`).toBe(
        `${SITE_ORIGIN}${route.path}`,
      )
    }
  })

  it('points the root at /welcome instead of at itself', () => {
    const root = PRERENDER_ROUTES.find((r) => r.path === '/')
    // `/` is inside ProtectedRoute: signed out it redirects to /welcome, signed
    // in it opens the app. It shows marketing copy to nobody, so it must not be
    // the canonical marketing URL.
    expect(root?.canonical).toBe(`${SITE_ORIGIN}/welcome`)
  })

  it('gives every page a distinct title and description', () => {
    const titles = PAGES.map((r) => r.title)
    const descriptions = PAGES.map((r) => r.description)
    // Six identical copies of one blurb is what this whole change replaces.
    expect(new Set(titles).size, 'two pages share a title').toBe(titles.length)
    expect(new Set(descriptions).size, 'two pages share a description').toBe(descriptions.length)
    for (const route of PAGES) {
      expect(route.title.length, `${route.path} title is too long for a result`).toBeLessThanOrEqual(
        70,
      )
      expect(
        route.description.length,
        `${route.path} description is too long for a snippet`,
      ).toBeLessThanOrEqual(200)
    }
  })
})

describe('sitemap.xml', () => {
  const listed = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

  it('lists exactly the canonical marketing URLs', () => {
    expect(listed.sort()).toEqual(PAGES.map((r) => r.canonical).sort())
  })

  it('does not list the root, which canonicalises elsewhere', () => {
    // A sitemap should only ever contain canonical URLs. Listing `/` would
    // submit a page that immediately points at another one.
    expect(listed).not.toContain(`${SITE_ORIGIN}/`)
  })
})

describe('robots.txt', () => {
  it('allows every page that is prerendered for crawlers', () => {
    for (const route of PAGES) {
      expect(ROBOTS, `${route.path} is prerendered but not allowed in robots.txt`).toContain(
        `Allow: ${route.path}`,
      )
    }
  })

  it('still points at the sitemap', () => {
    expect(ROBOTS).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)
  })

  it('never disallows a page it also allows', () => {
    for (const route of PAGES) {
      expect(ROBOTS, `${route.path} is both allowed and disallowed`).not.toContain(
        `Disallow: ${route.path}\n`,
      )
    }
  })
})

describe('structured data', () => {
  const app = JSON.parse(softwareApplicationJsonLd()) as Record<string, unknown>
  const org = JSON.parse(organizationJsonLd()) as Record<string, unknown>

  it('is valid JSON with the schema.org shape search engines expect', () => {
    expect(app['@context']).toBe('https://schema.org')
    expect(app['@type']).toBe('SoftwareApplication')
    expect(org['@type']).toBe('Organization')
    expect(app.name).toBe('Todonado')
  })

  it('claims NOTHING that is not a known fact', () => {
    /*
     * There are no reviews of Todonado and no published user count. Inventing
     * either is a Google structured-data policy violation and precisely the
     * species of claim the marketing pages were audited to remove; a rich
     * result built on a fabricated rating is worth less than no rich result.
     *
     * This is a whole-document check, so it also catches the field being added
     * to a nested offer rather than the top level.
     */
    const serialised = `${softwareApplicationJsonLd()}${organizationJsonLd()}`
    for (const forbidden of [
      'aggregateRating',
      'ratingValue',
      'reviewCount',
      'ratingCount',
      '"review"',
      'userInteractionCount',
      'award',
    ]) {
      expect(serialised, `structured data claims ${forbidden}, which nothing supports`).not.toContain(
        forbidden,
      )
    }
  })

  it('takes its prices from pricing.ts rather than repeating them', () => {
    const offers = app.offers as { name: string; price: string }[]
    const priceOf = (name: string) => offers.find((o) => o.name === name)?.price

    expect(priceOf('Free')).toBe('0')
    // If a price changes in one place, this fails rather than shipping an offer
    // in the search result that disagrees with the pricing page.
    expect(priceOf('Pro, monthly')).toBe(String(PRO_MONTHLY_USD))
    expect(priceOf('Pro, yearly')).toBe(String(PRO_YEARLY_USD))
    for (const offer of offers) {
      expect((offer as { priceCurrency?: string }).priceCurrency).toBe('USD')
    }
  })
})
