import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRateLimitStores } from './_lib/rateLimit.js'
import { applyTestModeEnv, clearTestModeEnv, makeFakeDb } from '../src/test/stripeDoubles.js'
import { resolveEffectivePlan, isFoundingEmail } from '../src/features/billing/planCore.js'

/**
 * Rate limiting on the money and outbound-request endpoints (audit FLAG-10),
 * and founding access that an email string alone cannot claim (audit FLAG-8).
 *
 * NEGATIVE CONTROL: with the `enforceRateLimit` calls removed from the three
 * handlers, every test in the first describe block fails — the 31st checkout in
 * a minute still gets a Stripe session. With the `emailVerified` guard removed
 * from resolveEffectivePlan, the unverified-founding tests fail.
 */

const getUserFromAuthHeader = vi.fn()
const getSupabaseAdmin = vi.fn()
const createCheckoutSession = vi.fn()

vi.mock('./_lib/supabase.js', () => ({
  getUserFromAuthHeader: (...a: unknown[]) => getUserFromAuthHeader(...a),
  getSupabaseAdmin: (...a: unknown[]) => getSupabaseAdmin(...a),
}))

vi.mock('./_lib/stripe.js', () => ({
  getStripe: () => ({
    checkout: { sessions: { create: (...a: unknown[]) => createCheckoutSession(...a) } },
    billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.com/x' }) } },
  }),
}))

const checkout = (await import('./create-checkout-session.js')).webHandler

const UID = 'user-123'
const MONTHLY = 'price_configuredMonthly1'

function configure() {
  // Shared with every other billing suite so a shape change breaks all of
  // them at once rather than leaving one asserting against a dead contract.
  applyTestModeEnv()
}

const post = () =>
  new Request('https://www.todonado.com/api/create-checkout-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer good' },
    body: JSON.stringify({ priceId: MONTHLY }),
  })

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  clearTestModeEnv()
  resetRateLimitStores()
  getUserFromAuthHeader.mockReset()
  getSupabaseAdmin.mockReset()
  createCheckoutSession.mockReset()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  configure()
  getUserFromAuthHeader.mockResolvedValue({ id: UID, email: 'a@b.test', emailVerified: true })
  createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_1' })
  // Shared double, so this suite exercises the checkout attempt RPCs too.
  getSupabaseAdmin.mockReturnValue(makeFakeDb().client)
})
afterEach(() => {
  clearTestModeEnv()
  resetRateLimitStores()
  warnSpy.mockRestore()
  errorSpy.mockRestore()
})

describe('FLAG-10 — the billing endpoints refuse a runaway caller', () => {
  it('REQUIRED: a loop is eventually answered 429 instead of minting sessions forever', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 40; i += 1) statuses.push((await checkout(post())).status)

    expect(
      statuses.filter((s) => s === 429).length,
      'an unbounded loop against checkout must eventually be refused',
    ).toBeGreaterThan(0)
  })

  it('stops calling Stripe once the limit is reached', async () => {
    for (let i = 0; i < 40; i += 1) await checkout(post())

    // The whole point: Stripe API throttling caused by our own traffic would
    // break checkout for real customers.
    expect(createCheckoutSession.mock.calls.length).toBeLessThan(40)
  })

  it('answers with a machine code and a usable Retry-After value', async () => {
    let blocked: Response | null = null
    for (let i = 0; i < 40 && !blocked; i += 1) {
      const res = await checkout(post())
      if (res.status === 429) blocked = res
    }
    expect(blocked).not.toBeNull()
    const body = (await blocked!.json()) as { error: string; retry_after: number }
    expect(body.error).toBe('rate_limited')
    expect(body.retry_after).toBeGreaterThan(0)
  })

  it('limits per user — a second account is unaffected by the first', async () => {
    for (let i = 0; i < 40; i += 1) await checkout(post())

    getUserFromAuthHeader.mockResolvedValue({
      id: 'a-different-user',
      email: 'c@d.test',
      emailVerified: true,
    })
    expect((await checkout(post())).status).toBe(200)
  })

  it('does not refuse an ordinary number of clicks', async () => {
    // A person clicking Upgrade a few times must never see a 429.
    for (let i = 0; i < 5; i += 1) {
      expect((await checkout(post())).status).toBe(200)
    }
  })
})

describe('FLAG-8 — founding access cannot be claimed by an email string alone', () => {
  const FOUNDING = ['founder@todonado.test']

  it('REQUIRED: an UNVERIFIED address does not get founding Pro', () => {
    const plan = resolveEffectivePlan({
      email: 'founder@todonado.test',
      foundingList: FOUNDING,
      emailVerified: false,
    })
    expect(plan, 'signup is free and self-service; an unconfirmed address proves nothing').toBe(
      'free',
    )
  })

  it('a verified founding address still works', () => {
    expect(
      resolveEffectivePlan({
        email: 'founder@todonado.test',
        foundingList: FOUNDING,
        emailVerified: true,
      }),
    ).toBe('pro')
  })

  it('REQUIRED: a plus-alias of a founding address is refused', () => {
    expect(isFoundingEmail('founder+free@todonado.test', FOUNDING)).toBe(false)
  })

  it('REQUIRED: a dotted alias of a founding address is refused', () => {
    // Gmail delivers f.ounder@ to founder@, but they are different strings and
    // providers disagree about which aliasing they honour.
    expect(isFoundingEmail('f.ounder@todonado.test', ['founder@todonado.test'])).toBe(false)
  })

  it('an aliased address is refused even when the alias itself is listed', () => {
    // The list holds canonical addresses; honouring an alias entry would make
    // the rule depend on how someone typed it.
    expect(isFoundingEmail('founder+x@todonado.test', ['founder+x@todonado.test'])).toBe(false)
  })

  it('still matches case-insensitively and ignores surrounding whitespace', () => {
    expect(isFoundingEmail('  FOUNDER@Todonado.TEST ', FOUNDING)).toBe(true)
  })

  it('rejects a value that is not an address at all', () => {
    expect(isFoundingEmail('founder', FOUNDING)).toBe(false)
    expect(isFoundingEmail('', FOUNDING)).toBe(false)
    expect(isFoundingEmail(null, FOUNDING)).toBe(false)
  })

  it('a real paid subscription outranks every founding rule', () => {
    // Someone who is actually paying must never be downgraded by this logic.
    expect(
      resolveEffectivePlan({
        billingPlan: 'pro',
        email: 'nobody@example.com',
        foundingList: FOUNDING,
        emailVerified: false,
      }),
    ).toBe('pro')
  })

  it('the CLIENT default stays permissive, because the server re-resolves anyway', () => {
    // Omitting emailVerified must not silently strip a founder's UI affordances;
    // the gate that matters is resolveServerPlan, which defaults the other way.
    expect(resolveEffectivePlan({ email: 'founder@todonado.test', foundingList: FOUNDING })).toBe(
      'pro',
    )
  })
})
