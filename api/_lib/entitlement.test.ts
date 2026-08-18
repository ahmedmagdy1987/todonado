import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ALL_FEATURES, canUseFeature } from '../../src/features/billing/entitlements.js'
import {
  classifyEntitlementFailure,
  checkFeature,
  resolveServerEntitlement,
  type EntitlementResult,
} from './entitlement.js'
import { FOUNDING_EMAILS } from '../../src/features/billing/planCore.js'

/**
 * ENTITLEMENT HAS THREE OUTCOMES, AND THE THIRD ONE IS THE POINT.
 *
 * The previous implementation was `Promise<Plan>` with the lookup inside
 * `try {} catch {}`. Every test you could write against it passed, because
 * "could not read billing" and "this user is on Free" were the same value. That
 * is precisely the defect: `20260801160000` exists because the read really did
 * answer 42501 on a real stack, and this function would have reported every
 * paying customer as Free with an empty log.
 *
 * So the suite below is organised around the distinction rather than around the
 * happy path: for each failure mode it asserts BOTH that the result is not
 * `free` (no silent downgrade) AND that it is not `pro` (no fail-open).
 */

const USER = '00000000-0000-4000-8000-000000000001'
const FOUNDER = FOUNDING_EMAILS[0]
const STRANGER = 'someone@example.test'

/** A billing lookup that resolves to `result`, or throws `thrown`. */
function admin(result: { data?: unknown; error?: unknown }, thrown?: unknown): SupabaseClient {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => {
      if (thrown) throw thrown
      return { data: result.data ?? null, error: result.error ?? null }
    },
  }
  return { from: () => q } as unknown as SupabaseClient
}

/** Narrow for readability; fails loudly rather than silently returning undefined. */
const asResolved = (r: EntitlementResult) => {
  expect(r.status, `expected a resolved entitlement, got ${JSON.stringify(r)}`).toBe('resolved')
  return r as Extract<EntitlementResult, { status: 'resolved' }>
}
const asUnavailable = (r: EntitlementResult) => {
  expect(r.status, `expected entitlement to be unavailable, got ${JSON.stringify(r)}`).toBe(
    'unavailable',
  )
  return r as Extract<EntitlementResult, { status: 'unavailable' }>
}

beforeEach(() => {
  // The failure paths log; keep the suite output readable but assert on it below.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolved outcomes — decided on evidence', () => {
  it('a billing row of pro resolves to Pro', async () => {
    const r = asResolved(
      await resolveServerEntitlement(admin({ data: { plan: 'pro' } }), USER, STRANGER, true),
    )
    expect(r.plan).toBe('pro')
    expect(r.source).toBe('billing')
  })

  it('a billing row of free resolves to Free', async () => {
    const r = asResolved(
      await resolveServerEntitlement(admin({ data: { plan: 'free' } }), USER, STRANGER, true),
    )
    expect(r.plan).toBe('free')
  })

  it('NO billing row is an answer, not a failure — Free', async () => {
    // Never billed is genuinely Free. This is the one "absent" case that is
    // knowledge rather than ignorance, so it must not become a 503.
    const r = asResolved(await resolveServerEntitlement(admin({ data: null }), USER, STRANGER, true))
    expect(r.plan).toBe('free')
    expect(r.source).toBe('no_billing_row')
  })
})

describe('unavailable outcomes — we do not know, and we say so', () => {
  const CASES: [string, { data?: unknown; error?: unknown }, unknown, string][] = [
    ['PostgREST 42501 permission denied', { error: { code: '42501', message: 'permission denied for table billing' } }, undefined, 'permission_denied'],
    ['the billing table is not applied (42P01)', { error: { code: '42P01', message: 'relation "billing" does not exist' } }, undefined, 'schema_outdated'],
    ['PostgREST schema cache miss (PGRST205)', { error: { code: 'PGRST205', message: 'Could not find the table in the schema cache' } }, undefined, 'schema_outdated'],
    ['a network timeout', {}, Object.assign(new TypeError('fetch failed'), { cause: new Error('UND_ERR_CONNECT_TIMEOUT') }), 'unreachable'],
    ['DNS failure', {}, new TypeError('fetch failed: getaddrinfo ENOTFOUND db.example'), 'unreachable'],
    ['a malformed plan value', { data: { plan: 'enterprise' } }, undefined, 'malformed'],
    ['a row that is not an object', { data: 'nonsense' }, undefined, 'malformed'],
    ['an unrecognised database error', { error: { code: '08006', message: 'connection_failure' } }, undefined, 'unknown'],
  ]

  it.each(CASES)('%s reports unavailable (%#)', async (_label, result, thrown, reason) => {
    const r = asUnavailable(
      await resolveServerEntitlement(admin(result, thrown), USER, STRANGER, true),
    )
    expect(r.reason).toBe(reason)
  })

  it('a missing service-role client is not_configured, not Free', async () => {
    const r = asUnavailable(await resolveServerEntitlement(null, USER, STRANGER, true))
    expect(r.reason).toBe('not_configured')
  })

  it.each(CASES)('NO SILENT DOWNGRADE: %s never answers Free (%#)', async (_l, result, thrown) => {
    const r = await resolveServerEntitlement(admin(result, thrown), USER, STRANGER, true)
    // The whole defect in one assertion. If this ever reads `resolved/free`,
    // a paying customer is being told they are not entitled because a query
    // failed.
    expect(r).not.toMatchObject({ status: 'resolved', plan: 'free' })
  })

  it.each(CASES)('NO FAIL-OPEN: %s never grants Pro to a stranger (%#)', async (_l, result, thrown) => {
    const r = await resolveServerEntitlement(admin(result, thrown), USER, STRANGER, true)
    expect(r).not.toMatchObject({ status: 'resolved', plan: 'pro' })
  })

  it('logs a structured reason WITHOUT the email address', async () => {
    const spy = vi.spyOn(console, 'error')
    await resolveServerEntitlement(
      admin({ error: { code: '42501', message: 'permission denied for table billing' } }),
      USER,
      STRANGER,
      true,
    )
    const line = spy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(line).toContain('entitlement_unavailable')
    expect(line).toContain('permission_denied')
    expect(line).toContain(USER)
    // An email identifies a person; a user id is the pseudonymous key we already
    // log. The distinction is the whole of "structured logging without PII".
    expect(line).not.toContain(STRANGER)
  })
})

describe('founding access does not depend on the database', () => {
  it('a VERIFIED founder is resolved even while billing is refusing', async () => {
    // planCore's precedence already decides this from the JWT alone, so making
    // a founder wait for a 503 would be inventing an outage we do not have.
    const r = asResolved(
      await resolveServerEntitlement(
        admin({ error: { code: '42501', message: 'permission denied for table billing' } }),
        USER,
        FOUNDER,
        true,
      ),
    )
    expect(r.plan).toBe('pro')
    expect(r.source).toBe('founding')
  })

  it('an UNVERIFIED founding address gets no such shortcut (FLAG-8)', async () => {
    const r = asUnavailable(
      await resolveServerEntitlement(
        admin({ error: { code: '42501', message: 'permission denied' } }),
        USER,
        FOUNDER,
        false,
      ),
    )
    expect(r.reason).toBe('permission_denied')
  })

  it('an unverified founder with a readable Free row is Free, not Pro', async () => {
    const r = asResolved(
      await resolveServerEntitlement(admin({ data: { plan: 'free' } }), USER, FOUNDER, false),
    )
    expect(r.plan).toBe('free')
  })
})

describe('classifyEntitlementFailure', () => {
  it('follows a nested cause rather than giving up at the wrapper', () => {
    // undici wraps the real reason; classifying the wrapper alone would report
    // every transport failure as `unknown`.
    const wrapped = Object.assign(new TypeError('boom'), {
      cause: { code: '42501', message: 'permission denied for table billing' },
    })
    expect(classifyEntitlementFailure(wrapped)).toBe('permission_denied')
  })

  it('does not loop forever on a self-referential cause', () => {
    const e: { message: string; cause?: unknown } = { message: 'weird' }
    e.cause = e
    expect(classifyEntitlementFailure(e)).toBe('unknown')
  })

  it('classifies a bare unknown as unknown rather than guessing', () => {
    expect(classifyEntitlementFailure(null)).toBe('unknown')
    expect(classifyEntitlementFailure('a string')).toBe('unknown')
  })
})

/**
 * `checkFeature` — the server asking the SAME table the client asks.
 *
 * The one server gate that existed read `entitlement.plan !== 'pro'`. That is
 * correct while there is one paid tier and one gated endpoint, and it is exactly
 * how the client half drifted into sixteen call sites that each decided for
 * themselves what "pro" entitles you to. Naming a CAPABILITY means both halves
 * consult `src/features/billing/entitlements.ts`, and a tier change is one edit
 * that both observe.
 */
describe('checkFeature', () => {
  const resolved = (plan: 'free' | 'pro'): EntitlementResult => ({
    status: 'resolved',
    plan,
    source: 'billing',
  })

  it('allows a Pro plan the capability it is entitled to', () => {
    expect(checkFeature(resolved('pro'), 'calendar.liveSync')).toBe('allowed')
  })

  it('denies a Free plan, on evidence', () => {
    expect(checkFeature(resolved('free'), 'calendar.liveSync')).toBe('denied')
  })

  it('reports UNAVAILABLE rather than denying when entitlement is unknown', () => {
    /*
     * The distinction the whole module exists for. `denied` becomes a 403, which
     * tells a paying customer they are not entitled; `unavailable` becomes a 503,
     * which says the server could not find out. Collapsing the second into the
     * first is the silent downgrade that shipped once already, when a missing
     * SELECT grant on `billing` made this exact read fail and the error was
     * swallowed as Free.
     */
    for (const reason of ['not_configured', 'permission_denied', 'unreachable'] as const) {
      expect(checkFeature({ status: 'unavailable', reason }, 'calendar.liveSync')).toBe(
        'unavailable',
      )
    }
  })

  it('agrees with the client contract for every feature, on both tiers', () => {
    // The property that makes one table worth having: if these two ever
    // disagreed, a user would be sold something the server refuses, or refused
    // something the UI offers.
    for (const feature of ALL_FEATURES) {
      for (const plan of ['free', 'pro'] as const) {
        const server = checkFeature(resolved(plan), feature)
        expect(server).toBe(canUseFeature(plan, feature) ? 'allowed' : 'denied')
      }
    }
  })
})
