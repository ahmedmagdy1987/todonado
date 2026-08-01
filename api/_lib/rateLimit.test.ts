import { describe, expect, it } from 'vitest'
import {
  LIMITS,
  checkRateLimit,
  pruneRateLimitStore,
  rateLimitKey,
  type RateLimitStore,
} from './rateLimit.js'

/**
 * The limiter's arithmetic (audit FLAG-10). `now` is injected throughout, so
 * nothing here sleeps and nothing is timing-flaky.
 *
 * NEGATIVE CONTROL: each behaviour is pinned by mutating the rule out — see the
 * table in the Stage 4 report. A limiter that never refuses is the failure mode
 * these tests exist to catch, and it is what the code did before this module.
 */

const store = (): RateLimitStore => new Map()

describe('checkRateLimit — the window', () => {
  it('allows up to the limit and refuses the one after', () => {
    const s = store()
    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit(s, 'k', 5, 60_000, 1000).allowed, `request ${i + 1}`).toBe(true)
    }
    expect(checkRateLimit(s, 'k', 5, 60_000, 1000).allowed).toBe(false)
  })

  it('counts down `remaining` honestly', () => {
    const s = store()
    expect(checkRateLimit(s, 'k', 3, 60_000, 1000).remaining).toBe(2)
    expect(checkRateLimit(s, 'k', 3, 60_000, 1000).remaining).toBe(1)
    expect(checkRateLimit(s, 'k', 3, 60_000, 1000).remaining).toBe(0)
  })

  it('reports a retry-after only when it actually refuses', () => {
    const s = store()
    expect(checkRateLimit(s, 'k', 1, 60_000, 1000).retryAfterSeconds).toBe(0)
    const blocked = checkRateLimit(s, 'k', 1, 60_000, 31_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(30)
  })

  it('never reports a retry-after of zero while blocked', () => {
    // A client reading `Retry-After: 0` would retry instantly, which is the one
    // thing a limiter must not invite.
    const s = store()
    checkRateLimit(s, 'k', 1, 60_000, 1000)
    const blocked = checkRateLimit(s, 'k', 1, 60_000, 60_999)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })

  it('opens a fresh window once the old one expires', () => {
    const s = store()
    checkRateLimit(s, 'k', 1, 60_000, 1000)
    expect(checkRateLimit(s, 'k', 1, 60_000, 1000).allowed).toBe(false)
    expect(checkRateLimit(s, 'k', 1, 60_000, 61_001).allowed).toBe(true)
  })

  it('keys are independent — one noisy user cannot block another', () => {
    const s = store()
    checkRateLimit(s, 'a', 1, 60_000, 1000)
    expect(checkRateLimit(s, 'a', 1, 60_000, 1000).allowed).toBe(false)
    expect(checkRateLimit(s, 'b', 1, 60_000, 1000).allowed).toBe(true)
  })
})

describe('rateLimitKey — who the limit is counted against', () => {
  const req = (headers: Record<string, string> = {}) =>
    new Request('https://www.todonado.com/api/x', { method: 'POST', headers })

  it('prefers the verified user id over any header', () => {
    const key = rateLimitKey('billing', 'user-1', req({ 'x-forwarded-for': '9.9.9.9' }))
    expect(key).toBe('billing:user:user-1')
    expect(
      key,
      'a spoofable header must never dilute a limit we can key on a verified identity',
    ).not.toContain('9.9.9.9')
  })

  it('falls back to the first x-forwarded-for entry when unidentified', () => {
    expect(rateLimitKey('billing', null, req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe(
      'billing:ip:1.2.3.4',
    )
  })

  it('buckets an unidentifiable caller rather than exempting them', () => {
    expect(rateLimitKey('billing', null, req())).toBe('billing:ip:unknown')
  })

  it('scopes are separate, so a busy proxy cannot starve checkout', () => {
    expect(rateLimitKey('billing', 'u', req())).not.toBe(rateLimitKey('calendar', 'u', req()))
  })
})

describe('pruneRateLimitStore', () => {
  it('drops expired windows and keeps live ones', () => {
    const s = store()
    checkRateLimit(s, 'old', 5, 1_000, 1000)
    checkRateLimit(s, 'new', 5, 60_000, 1000)
    pruneRateLimitStore(s, 30_000)
    expect(s.has('old')).toBe(false)
    expect(s.has('new')).toBe(true)
  })
})

describe('LIMITS — the configured budgets', () => {
  it('are real numbers, not placeholders', () => {
    for (const [name, { limit, windowMs }] of Object.entries(LIMITS)) {
      expect(limit, `${name} limit`).toBeGreaterThan(0)
      expect(limit, `${name} limit should not be so high it never fires`).toBeLessThan(100)
      expect(windowMs, `${name} window`).toBeGreaterThan(0)
    }
  })

  it('holds the calendar proxy tighter than billing — it makes OUTBOUND requests', () => {
    expect(LIMITS.calendar.limit).toBeLessThanOrEqual(LIMITS.billing.limit)
  })
})
