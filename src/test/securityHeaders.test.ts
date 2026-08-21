import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/**
 * `vercel.json` is the single source of truth for the production security
 * headers (the Vite dev/preview plugin reads this same file, so dev and prod
 * cannot drift). These assertions lock the values in: a header silently
 * disappearing — or the CSP being flipped from Report-Only to enforcing without
 * a deliberate review — fails here rather than in production.
 *
 * Added applying finding M1 of docs/AUDIT_2026-07-28_prelaunch.md.
 */

interface VercelConfig {
  headers?: { source: string; headers: { key: string; value: string }[] }[]
}

const config = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'),
) as VercelConfig

const rule = config.headers?.find((h) => h.source === '/(.*)')
const byKey = new Map((rule?.headers ?? []).map((h) => [h.key, h.value]))

describe('production security headers (vercel.json)', () => {
  it('applies a catch-all header rule', () => {
    expect(rule, 'no /(.*) headers rule in vercel.json').toBeDefined()
  })

  it.each([
    ['X-Frame-Options', 'DENY'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    // `microphone=(self)` and `payment=(self)`, NOT `()`. An empty allowlist denies
    // the feature to every origin INCLUDING our own — the blanket `microphone=()`
    // would have blocked the journal's voice notes in production.
    ['Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(self)'],
    ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ])('sends %s', (key, value) => {
    expect(byKey.get(key)).toBe(value)
  })

  it('keeps the rewrite rule that makes the SPA work, pointed at the noindex shell', () => {
    const rewrites = (JSON.parse(
      readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'),
    ) as { rewrites?: { source: string; destination: string }[] }).rewrites

    // Unchanged: everything except /api/ still falls through to one HTML file,
    // which is what lets React Router own /today, /focus and the rest.
    expect(rewrites?.[0]?.source).toBe('/((?!api/).*)')

    /*
     * THE DESTINATION IS `app.html`, NOT `index.html`, AND THAT IS THE POINT.
     *
     * While it was index.html, one file was three things: the root page, the
     * app shell, and the handler for every URL that does not exist. A request
     * for /a-typo answered 200 carrying the homepage's title and canonical,
     * which is a soft 404. Splitting the shell out lets it declare `noindex`
     * without that also applying to the marketing pages, which are now real
     * prerendered files (scripts/prerender.mjs writes both).
     */
    expect(rewrites?.[0]?.destination).toBe('/app.html')
  })
})

describe('content security policy', () => {
  const csp = byKey.get('Content-Security-Policy')

  it('is ENFORCING, not report-only (audit FLAG-11)', () => {
    /*
     * It shipped report-only with no report-uri and no report-to, so it neither
     * blocked anything nor collected anything — it was documentation wearing a
     * header's clothes. The app has zero inline scripts and zero XSS sinks
     * (audit 1.8), so enforcing costs nothing and is the whole point.
     *
     * Dev and preview still serve it REPORT-ONLY: Vite's inline HMR preamble
     * and its ws://localhost connection would otherwise be blocked. That
     * downgrade lives in vercelSecurityHeaders() in vite.config.ts and changes
     * only the header KEY, never the policy value.
     */
    expect(csp, 'Content-Security-Policy header is missing').toBeTruthy()
    expect(
      byKey.has('Content-Security-Policy-Report-Only'),
      'shipping both is ambiguous — production enforces, and only that',
    ).toBe(false)
  })

  it.each([
    ["default-src 'self'", 'locks the default fetch origin'],
    ["frame-ancestors 'none'", 'blocks clickjacking'],
    ["object-src 'none'", 'blocks legacy plugin embeds'],
    ["base-uri 'self'", 'blocks <base> hijacking'],
    ["form-action 'self'", 'blocks form exfiltration'],
  ])('contains %s (%s)', (directive) => {
    expect(csp).toContain(directive)
  })

  it('allows the Supabase REST origin AND the realtime websocket', () => {
    // ENABLE_REALTIME is on — omitting wss: would break sync the moment CSP enforces.
    expect(csp).toContain('https://lplsbfduankkpglyusjp.supabase.co')
    expect(csp).toContain('wss://lplsbfduankkpglyusjp.supabase.co')
  })

  it('allows the Google Fonts stylesheet + font origins used by index.html', () => {
    expect(csp).toContain('https://fonts.googleapis.com')
    expect(csp).toContain('https://fonts.gstatic.com')
  })

  it("allows inline STYLES (Tailwind) but never inline SCRIPTS", () => {
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain("'unsafe-eval'")
  })
})
