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
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'],
    ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ])('sends %s', (key, value) => {
    expect(byKey.get(key)).toBe(value)
  })

  it('keeps the rewrite rule that makes the SPA work', () => {
    const rewrites = (JSON.parse(
      readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'),
    ) as { rewrites?: { source: string; destination: string }[] }).rewrites
    expect(rewrites?.[0]?.destination).toBe('/index.html')
  })
})

describe('content security policy', () => {
  const csp = byKey.get('Content-Security-Policy-Report-Only')

  it('ships in REPORT-ONLY mode', () => {
    expect(csp, 'CSP-Report-Only header is missing').toBeTruthy()
    // Enforcing CSP is a deliberate follow-up, not an accident. If this fails,
    // someone flipped it — confirm the report queue is clean first.
    expect(byKey.has('Content-Security-Policy')).toBe(false)
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
