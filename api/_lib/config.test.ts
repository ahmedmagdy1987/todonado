import { afterEach, describe, expect, it } from 'vitest'
import {
  configuredPriceIds,
  isConfiguredPriceId,
  isServerBillingConfigured,
  isValidPriceId,
  missingServerBillingVars,
  missingWebhookVars,
  serverEnv,
  type ServerEnv,
} from './config.js'

const MONTHLY = 'price_configuredMonthly1'
const YEARLY = 'price_configuredYearly12'

const FULL: ServerEnv = {
  stripeSecretKey: 'sk_test_x',
  stripeWebhookSecret: 'whsec_x',
  stripePriceMonthly: MONTHLY,
  stripePriceYearly: YEARLY,
  supabaseUrl: 'https://p.supabase.co',
  supabaseServiceRoleKey: 'service-role',
}

const ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_MONTHLY',
  'STRIPE_PRICE_YEARLY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('missingServerBillingVars', () => {
  it('is empty when everything checkout needs is present', () => {
    expect(missingServerBillingVars(FULL)).toEqual([])
    expect(isServerBillingConfigured(FULL)).toBe(true)
  })

  it('reports the NAME of each missing var (and never a value)', () => {
    const missing = missingServerBillingVars({ ...FULL, stripeSecretKey: '' })
    expect(missing).toEqual(['STRIPE_SECRET_KEY'])
    expect(missing.join()).not.toContain('sk_test')
  })

  it('reports every missing var when nothing is configured', () => {
    const missing = missingServerBillingVars({
      stripeSecretKey: '',
      stripeWebhookSecret: '',
      stripePriceMonthly: '',
      stripePriceYearly: '',
      supabaseUrl: '',
      supabaseServiceRoleKey: '',
    })
    expect(missing).toEqual([
      'STRIPE_SECRET_KEY',
      'STRIPE_PRICE_MONTHLY',
      'STRIPE_PRICE_YEARLY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ])
  })

  it('does NOT require the webhook secret for checkout/portal', () => {
    expect(missingServerBillingVars({ ...FULL, stripeWebhookSecret: '' })).toEqual([])
  })
})

describe('missingWebhookVars', () => {
  it('additionally requires STRIPE_WEBHOOK_SECRET', () => {
    expect(missingWebhookVars(FULL)).toEqual([])
    expect(missingWebhookVars({ ...FULL, stripeWebhookSecret: '' })).toEqual([
      'STRIPE_WEBHOOK_SECRET',
    ])
  })
})

describe('serverEnv', () => {
  it('treats an unset var as empty rather than throwing', () => {
    expect(() => serverEnv()).not.toThrow()
    expect(missingServerBillingVars(serverEnv()).length).toBeGreaterThan(0)
  })

  it('trims whitespace — a pasted key with a trailing newline still counts', () => {
    process.env.STRIPE_SECRET_KEY = '  sk_test_x\n'
    process.env.STRIPE_PRICE_MONTHLY = MONTHLY
    process.env.STRIPE_PRICE_YEARLY = YEARLY
    process.env.SUPABASE_URL = 'https://p.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
    expect(missingServerBillingVars(serverEnv())).toEqual([])
  })

  it('treats a whitespace-only var as missing', () => {
    process.env.STRIPE_SECRET_KEY = '   '
    expect(missingServerBillingVars(serverEnv())).toContain('STRIPE_SECRET_KEY')
  })
})

describe('isValidPriceId', () => {
  it('accepts a real-shaped Stripe price id', () => {
    expect(isValidPriceId('price_1QAbCdEfGhIjKlMn')).toBe(true)
  })

  const invalid: Array<[label: string, value: unknown]> = [
    ['empty string', ''],
    ['prefix only', 'price_'],
    ['too short', 'price_abc'],
    ['a product id, not a price', 'prod_1QAbCdEfGhIj'],
    ['a secret key', 'sk_live_1QAbCdEfGhIj'],
    ['contains a space', 'price_1QAb CdEf'],
    ['injection-ish', "price_1QAb'; drop--"],
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an object that stringifies', { toString: () => 'price_1QAbCdEfGhIj' }],
  ]

  it.each(invalid)('rejects %s', (_label, value) => {
    expect(isValidPriceId(value)).toBe(false)
  })
})

describe('configuredPriceIds / isConfiguredPriceId — the actual FLAG-2 gate', () => {
  it('lists exactly the two configured prices', () => {
    expect(configuredPriceIds(FULL)).toEqual([MONTHLY, YEARLY])
  })

  it('accepts each configured price', () => {
    expect(isConfiguredPriceId(MONTHLY, FULL)).toBe(true)
    expect(isConfiguredPriceId(YEARLY, FULL)).toBe(true)
  })

  it('REJECTS a well-formed price id that is not ours — the whole point of the flag', () => {
    // Passes isValidPriceId, exists in the Stripe account, and must still lose.
    const grandfathered = 'price_grandfatheredCheap9'
    expect(isValidPriceId(grandfathered)).toBe(true)
    expect(isConfiguredPriceId(grandfathered, FULL)).toBe(false)
  })

  it('FAILS CLOSED — an unset env var rejects everything, never accepts everything', () => {
    const none: ServerEnv = { ...FULL, stripePriceMonthly: '', stripePriceYearly: '' }
    expect(configuredPriceIds(none)).toEqual([])
    expect(isConfiguredPriceId(MONTHLY, none)).toBe(false)
  })

  it('never lets an empty env var widen the list to include the empty string', () => {
    const partial: ServerEnv = { ...FULL, stripePriceYearly: '' }
    expect(configuredPriceIds(partial)).toEqual([MONTHLY])
    expect(isConfiguredPriceId('', partial)).toBe(false)
  })

  it('is an exact match, not a prefix or substring match', () => {
    expect(isConfiguredPriceId(MONTHLY + 'x', FULL)).toBe(false)
    expect(isConfiguredPriceId(MONTHLY.slice(0, -1), FULL)).toBe(false)
  })

  it('rejects non-string input without throwing', () => {
    for (const value of [undefined, null, 42, {}, [MONTHLY]]) {
      expect(isConfiguredPriceId(value, FULL)).toBe(false)
    }
  })
})
