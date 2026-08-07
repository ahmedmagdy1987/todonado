import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EXPECTED_MONTHLY_USD,
  EXPECTED_YEARLY_USD,
  MANUAL_GATES,
  REQUIRED_MIGRATIONS_BEFORE_LIVE,
  checkFunctionBudget,
  checkMigrationChain,
  checkPricing,
  checkStripeCsp,
  checkStripeEnv,
  summarise,
} from '../../scripts/preflightLive.js'

/**
 * THE PREFLIGHT IS ONLY WORTH RUNNING IF IT WOULD ACTUALLY GO RED.
 *
 * A checklist that passes unconditionally is worse than no checklist, because
 * it converts "nobody checked" into "something checked and approved". So every
 * check here is exercised in BOTH directions — against the real repo, where it
 * must pass, and against a deliberately broken input, where it must fail.
 *
 * The env cases matter most: `checkStripeEnv` is the one piece of judgement that
 * is DUPLICATED from api/_lib/config.ts rather than imported (that module is
 * TypeScript compiled for the Vercel runtime; this one is plain ESM run by
 * node with no build step). The last describe block below pins the duplicate to
 * its original by reading config.ts, so the two cannot drift silently.
 */

const repoFile = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

const MIGRATIONS = readdirSync(repoFile('../../supabase/migrations'))
const API_FILES = readdirSync(repoFile('../../api'), { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)

/**
 * The deployed policy, read from vercel.json directly rather than through
 * scripts/vercelHeaders.js — that module has no .d.ts, and adding one just to
 * reach a single string from a test would be the tail wagging the dog.
 */
function productionCsp(): string {
  const config = JSON.parse(readFileSync(repoFile('../../vercel.json'), 'utf8')) as {
    headers?: { source: string; headers: { key: string; value: string }[] }[]
  }
  const rule = (config.headers ?? []).find((h) => h.source === '/(.*)')
  const header = rule?.headers.find((h) => h.key === 'Content-Security-Policy')
  if (!header) throw new Error('vercel.json has no catch-all Content-Security-Policy')
  return header.value
}

describe('the go-live preflight, against the real repository', () => {
  it('finds all four pre-live migrations, with nothing newer', () => {
    const result = checkMigrationChain(MIGRATIONS)
    expect(result.status, result.detail).toBe('pass')
  })

  it('finds the function budget intact', () => {
    const result = checkFunctionBudget(API_FILES)
    expect(result.status, result.detail).toBe('pass')
  })

  it('finds the deployed CSP still allows Stripe Checkout', () => {
    const result = checkStripeCsp(productionCsp())
    expect(result.status, result.detail).toBe('pass')
  })

  it('finds the published prices unchanged', () => {
    const source = readFileSync(repoFile('../features/marketing/pricing.ts'), 'utf8')
    const read = (name: string) =>
      Number(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`).exec(source)?.[1])

    // The regex is the one the CLI uses; if pricing.ts is reshaped so it stops
    // matching, this fails here rather than silently reporting NaN at go-live.
    expect(read('PRO_MONTHLY_USD')).toBe(EXPECTED_MONTHLY_USD)
    expect(read('PRO_YEARLY_USD')).toBe(EXPECTED_YEARLY_USD)

    const result = checkPricing({
      monthlyUsd: read('PRO_MONTHLY_USD'),
      yearlyUsd: read('PRO_YEARLY_USD'),
    })
    expect(result.status, result.detail).toBe('pass')
    expect(result.detail).toContain('$4/month billed annually')
    expect(result.detail).toContain('save 20%')
  })
})

describe('the go-live preflight, when something is actually wrong', () => {
  it('fails when a pre-live migration file is missing', () => {
    const without = MIGRATIONS.filter((f) => f !== REQUIRED_MIGRATIONS_BEFORE_LIVE[0])
    const result = checkMigrationChain(without)
    expect(result.status).toBe('fail')
    expect(result.detail).toContain(REQUIRED_MIGRATIONS_BEFORE_LIVE[0])
  })

  it('fails when a migration lands after the last one the runbook orders', () => {
    const result = checkMigrationChain([...MIGRATIONS, '20260901120000_something_new.sql'])
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('20260901120000_something_new.sql')
  })

  it('fails when the function budget is exceeded', () => {
    const tooMany = [...API_FILES, 'one-more.ts', 'and-another.ts']
    expect(checkFunctionBudget(tooMany).status).toBe('fail')
  })

  it('fails when a real endpoint has been deleted to make room', () => {
    const result = checkFunctionBudget(API_FILES.filter((f) => f !== 'stripe-webhook.ts'))
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('stripe-webhook.ts')
  })

  it('fails when frame-src stops allowing Stripe', () => {
    const stripped = productionCsp().replace(/frame-src[^;]*;/, "frame-src 'none';")
    const result = checkStripeCsp(stripped)
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('js.stripe.com')
  })

  it('fails when there is no frame-src at all', () => {
    expect(checkStripeCsp("default-src 'self'").status).toBe('fail')
  })

  it('fails when the yearly price stops being a 20% saving', () => {
    // $50/year against $5/month is a 16.67% saving — the copy would be a lie.
    const result = checkPricing({ monthlyUsd: 5, yearlyUsd: 50 })
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('expected $48')
  })

  it('fails, rather than dividing by zero, on unreadable prices', () => {
    expect(checkPricing({ monthlyUsd: Number.NaN, yearlyUsd: 48 }).status).toBe('fail')
    expect(checkPricing({ monthlyUsd: 0, yearlyUsd: 48 }).status).toBe('fail')
  })
})

describe('checkStripeEnv', () => {
  const complete = {
    STRIPE_MODE: 'live',
    STRIPE_SECRET_KEY: 'sk_live_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    STRIPE_PRICE_MONTHLY: 'price_m',
    STRIPE_PRICE_YEARLY: 'price_y',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    VITE_STRIPE_PUBLISHABLE_KEY: 'pk_live_x',
    VITE_STRIPE_PRICE_MONTHLY: 'price_m',
    VITE_STRIPE_PRICE_YEARLY: 'price_y',
  }

  it('skips — and so does not block — when the shell has no server env', () => {
    const result = checkStripeEnv({})
    expect(result.status).toBe('skip')
    expect(summarise([result], MANUAL_GATES.map((g) => g.flag)).ready).toBe(true)
  })

  it('passes on a fully consistent live configuration', () => {
    const result = checkStripeEnv(complete)
    expect(result.status, result.detail).toBe('pass')
  })

  it('passes on a fully consistent test configuration', () => {
    const result = checkStripeEnv({
      ...complete,
      STRIPE_MODE: 'test',
      STRIPE_SECRET_KEY: 'sk_test_x',
      VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_x',
    })
    expect(result.status, result.detail).toBe('pass')
  })

  it('catches the half-live deployment: live mode, test secret key', () => {
    const result = checkStripeEnv({ ...complete, STRIPE_SECRET_KEY: 'sk_test_x' })
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('STRIPE_SECRET_KEY_MODE_MISMATCH')
  })

  it('catches a test publishable key shipped to a live deployment', () => {
    const result = checkStripeEnv({ ...complete, VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_x' })
    expect(result.detail).toContain('VITE_STRIPE_PUBLISHABLE_KEY_MODE_MISMATCH')
  })

  it('catches the price ids disagreeing between client and server', () => {
    const result = checkStripeEnv({ ...complete, VITE_STRIPE_PRICE_YEARLY: 'price_other' })
    expect(result.detail).toContain('PRICE_YEARLY_CLIENT_SERVER_MISMATCH')
  })

  it('rejects a mode that is neither test nor live', () => {
    expect(checkStripeEnv({ STRIPE_MODE: 'sandbox' }).detail).toContain('STRIPE_MODE_INVALID')
  })

  it('names the variables that are unset', () => {
    const result = checkStripeEnv({ STRIPE_MODE: 'live' })
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('STRIPE_WEBHOOK_SECRET')
    expect(result.detail).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('NEVER echoes a value, only names, codes and the mode', () => {
    const secrets = ['sk_live_x', 'pk_live_x', 'whsec_x', 'service', 'price_m', 'price_y']
    for (const env of [
      complete,
      { ...complete, STRIPE_SECRET_KEY: 'sk_test_x' },
      { ...complete, VITE_STRIPE_PRICE_YEARLY: 'price_other' },
    ]) {
      const { detail } = checkStripeEnv(env)
      for (const secret of secrets) expect(detail).not.toContain(secret)
    }
  })
})

describe('the verdict', () => {
  const ok = { id: 'x', title: 'x', status: 'pass' as const, detail: '' }
  const bad = { id: 'y', title: 'broken', status: 'fail' as const, detail: 'because' }
  const allGates = MANUAL_GATES.map((g) => g.flag)

  it('is NOT READY while any manual gate is unacknowledged', () => {
    expect(summarise([ok], []).verdict).toBe('NOT READY FOR LIVE')
    expect(summarise([ok], allGates.slice(1)).verdict).toBe('NOT READY FOR LIVE')
  })

  it('is NOT READY when a check failed, even with every gate acknowledged', () => {
    const summary = summarise([ok, bad], allGates)
    expect(summary.verdict).toBe('NOT READY FOR LIVE')
    expect(summary.reasons.join(' ')).toContain('broken')
  })

  it('is READY only when nothing failed and every gate is acknowledged', () => {
    const summary = summarise([ok], allGates)
    expect(summary.verdict).toBe('READY FOR LIVE')
    expect(summary.reasons).toEqual([])
  })

  it('names each outstanding gate with the flag that clears it', () => {
    const summary = summarise([ok], [])
    for (const gate of MANUAL_GATES) {
      expect(summary.reasons.join('\n')).toContain(`--${gate.flag}`)
    }
  })

  it('requires the database cleanup to be one of those gates', () => {
    // The whole point of issue #8. If this gate is ever dropped, the preflight
    // would print READY while Sandbox rows were still granting Pro in live.
    expect(allGates).toContain('cleanup-verified')
    expect(allGates).toContain('inventory-reviewed')
  })
})

describe('the duplicated mode rules stay in step with api/_lib/config.ts', () => {
  /**
   * `stripeModeProblems` is the running deployment's copy of these rules. It is
   * not imported here (different tsconfig project, different runtime), so this
   * reads it as text and pins the CODES. A new problem code added there without
   * being mirrored means the preflight would pass a deployment the server would
   * then refuse to sell from — the exact surprise this whole exercise exists to
   * remove.
   */
  const config = readFileSync(repoFile('../../api/_lib/config.ts'), 'utf8')
  const body = config.slice(config.indexOf('export function stripeModeProblems'))

  const MIRRORED = [
    'STRIPE_MODE_INVALID',
    'STRIPE_SECRET_KEY_MODE_MISMATCH',
    'VITE_STRIPE_PUBLISHABLE_KEY_MODE_MISMATCH',
    'PRICE_MONTHLY_CLIENT_SERVER_MISMATCH',
    'PRICE_YEARLY_CLIENT_SERVER_MISMATCH',
  ]

  it('mirrors every problem code the server can raise', () => {
    const codes = [...body.matchAll(/'([A-Z][A-Z0-9_]{4,})'/g)].map((m) => m[1])
    expect(new Set(codes)).toEqual(new Set(MIRRORED))
  })

  it('still keys the mode check off the same _test_ / _live_ infixes', () => {
    expect(body).toContain("'_live_'")
    expect(body).toContain("'_test_'")
  })

  it('still refuses to infer mode from the webhook secret', () => {
    // whsec_ does not encode mode; treating it as a signal would be a guess
    // dressed as a check, which is why it is a MANUAL gate in the preflight.
    expect(body).not.toContain('whsec_')
    expect(MANUAL_GATES.map((g) => g.flag)).toContain('webhook-verified')
  })
})
