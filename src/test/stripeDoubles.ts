/**
 * Shared test doubles for the money path.
 *
 * ONE MODEL, USED BY EVERY BILLING SUITE. The alternative — each test file
 * hand-rolling its own chainable Supabase stub — is how a suite ends up
 * asserting against a shape the production code stopped using, which is exactly
 * the failure mode that let a non-atomic write pass 13 green tests.
 *
 * The Postgres functions are modelled in TypeScript. That is a MODEL, not the
 * implementation: real atomicity comes from `select … for update` and a partial
 * unique index, neither of which a unit test can exercise. The SQL itself is
 * pinned clause-by-clause in api/billingEventOrderingMigration.test.ts and
 * api/checkoutAttemptsMigration.test.ts. What these doubles prove is that the
 * HANDLERS drive those functions correctly and behave correctly given them.
 */

export interface BillingRow {
  user_id: string
  plan: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string | null
  current_period_end: string | null
  last_stripe_event_id: string | null
  last_stripe_event_at: string | null
}

export interface AttemptRow {
  id: string
  user_id: string
  price_id: string
  status: string
  stripe_session_id: string | null
  stripe_subscription_id: string | null
}

const NON_TERMINAL = new Set(['reserved', 'session_created', 'completed'])

export interface FakeDbOptions {
  billing?: Partial<BillingRow> | null
  attempts?: AttemptRow[]
  /** Force reads to wait, so a test can interleave two handlers. */
  readGate?: Promise<void> | null
  /** Make a specific rpc fail, e.g. to simulate a missing migration. */
  rpcError?: { code?: string; message?: string } | null
}

export function makeFakeDb(options: FakeDbOptions = {}) {
  const state = {
    billing: options.billing
      ? ({
          user_id: 'user-123',
          plan: 'free',
          stripe_customer_id: null,
          stripe_subscription_id: null,
          subscription_status: null,
          current_period_end: null,
          last_stripe_event_id: null,
          last_stripe_event_at: null,
          ...options.billing,
        } as BillingRow)
      : null,
    attempts: [...(options.attempts ?? [])],
  }
  // Starts high so a generated id can never collide with an id a test seeded
  // by hand — a collision made an 'expired' attempt look like it had been
  // revived, which is the opposite of what the test was checking.
  let nextUuid = 500
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []

  /** Mirrors apply_stripe_billing_event in 20260801140000. */
  function applyOrdering(a: Record<string, unknown>): string {
    const cur = state.billing
    const eventAt = Date.parse(String(a.p_event_at))
    const row = (): BillingRow => ({
      user_id: String(a.p_user_id),
      plan: String(a.p_plan),
      stripe_customer_id: (a.p_customer_id as string) ?? cur?.stripe_customer_id ?? null,
      stripe_subscription_id: (a.p_subscription_id as string) ?? cur?.stripe_subscription_id ?? null,
      subscription_status: (a.p_status as string) ?? null,
      current_period_end: a.p_set_period_end
        ? ((a.p_period_end as string) ?? null)
        : (cur?.current_period_end ?? null),
      last_stripe_event_id: String(a.p_event_id),
      last_stripe_event_at: String(a.p_event_at),
    })

    if (!cur) {
      state.billing = row()
      return 'applied'
    }
    if (cur.last_stripe_event_id === a.p_event_id) return 'duplicate_event'
    const markMs = cur.last_stripe_event_at ? Date.parse(cur.last_stripe_event_at) : null
    if (markMs !== null && eventAt < markMs) return 'stale_event'

    if (a.p_plan === 'free' && cur.plan === 'pro') {
      if (markMs !== null && eventAt <= markMs) return 'stale_downgrade'
      if (
        cur.stripe_subscription_id != null &&
        a.p_subscription_id != null &&
        cur.stripe_subscription_id !== a.p_subscription_id
      ) {
        return 'downgrade_for_other_subscription'
      }
    }
    state.billing = row()
    return 'applied'
  }

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args })
    if (options.rpcError) return { data: null, error: options.rpcError }

    if (fn === 'reserve_checkout_attempt') {
      // The partial unique index, modelled: at most one non-terminal row.
      const open = state.attempts.find(
        (a) => a.user_id === args.p_user_id && NON_TERMINAL.has(a.status),
      )
      if (open) return { data: open, error: null }
      const created: AttemptRow = {
        id: `00000000-0000-4000-8000-${String(nextUuid++).padStart(12, '0')}`,
        user_id: String(args.p_user_id),
        price_id: String(args.p_price_id),
        status: 'reserved',
        stripe_session_id: null,
        stripe_subscription_id: null,
      }
      state.attempts.push(created)
      return { data: created, error: null }
    }

    if (fn === 'mark_checkout_attempt') {
      const a = state.attempts.find((x) => x.id === args.p_attempt_id)
      if (a) {
        a.status = String(args.p_status)
        if (args.p_session_id) a.stripe_session_id = String(args.p_session_id)
      }
      return { data: a ?? null, error: null }
    }

    if (fn === 'bind_verified_checkout') {
      const a = state.attempts.find((x) => x.id === args.p_attempt_id)
      if (!a) return { data: 'unknown_attempt', error: null }
      if (a.status === 'consumed') {
        if (a.stripe_subscription_id !== args.p_subscription_id) {
          return { data: 'attempt_already_consumed', error: null }
        }
      } else if (a.status === 'expired' || a.status === 'failed') {
        return { data: 'attempt_not_open', error: null }
      }
      if (a.price_id !== args.p_price_id) return { data: 'attempt_price_mismatch', error: null }
      a.status = 'consumed'
      a.stripe_subscription_id = String(args.p_subscription_id)
      return {
        data: applyOrdering({
          ...args,
          p_user_id: a.user_id,
          // The plan is the CALLER's, derived from the retrieved subscription
          // status. Hard-coding 'pro' here is the defect the real database
          // execution exposed.
          p_plan: args.p_plan,
          p_set_period_end: args.p_period_end != null,
        }),
        error: null,
      }
    }

    if (fn === 'apply_stripe_subscription_event') {
      const cur = state.billing
      if (!cur || cur.stripe_subscription_id !== args.p_subscription_id) {
        return { data: 'unknown_subscription', error: null }
      }
      return { data: applyOrdering({ ...args, p_user_id: cur.user_id }), error: null }
    }

    return { data: null, error: { code: '42883', message: `unknown function ${fn}` } }
  }

  const client = {
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (options.readGate) await options.readGate
            return { data: state.billing ? { ...state.billing } : null, error: null }
          },
        }),
      }),
    }),
  }

  return { state, client, rpcCalls }
}

/** A Stripe double whose objects can be shaped per test. */
export interface FakeStripeOptions {
  sessions?: Record<string, Record<string, unknown>>
  subscriptions?: Record<string, Record<string, unknown>>
  createSession?: (args: unknown, opts: unknown) => Promise<Record<string, unknown>>
  livemode?: boolean
}

export function makeFakeStripe(options: FakeStripeOptions = {}) {
  const created: Array<{ args: Record<string, unknown>; opts: { idempotencyKey?: string } }> = []
  /** Stripe's real idempotency behaviour: same key ⇒ same object. */
  const byIdempotencyKey = new Map<string, Record<string, unknown>>()
  let n = 1

  const stripe = {
    checkout: {
      sessions: {
        create: async (args: Record<string, unknown>, opts: { idempotencyKey?: string } = {}) => {
          created.push({ args, opts })
          if (options.createSession) return await options.createSession(args, opts)
          const key = opts.idempotencyKey ?? `no-key-${n}`
          const existing = byIdempotencyKey.get(key)
          if (existing) return existing
          const session = {
            id: `cs_test_${n++}`,
            url: `https://checkout.stripe.com/c/pay/cs_${n}`,
            livemode: options.livemode ?? false,
            mode: 'subscription',
            status: 'open',
          }
          byIdempotencyKey.set(key, session)
          return session
        },
        retrieve: async (id: string) => {
          const s = options.sessions?.[id]
          if (!s) throw new Error(`No such checkout.session: ${id}`)
          return s
        },
      },
    },
    subscriptions: {
      retrieve: async (id: string) => {
        const s = options.subscriptions?.[id]
        if (!s) throw new Error(`No such subscription: ${id}`)
        return s
      },
    },
    billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.com/x' }) } },
    webhooks: { constructEvent: () => ({}) },
  }
  return { stripe, created, byIdempotencyKey }
}

/** Env for a consistent TEST-mode deployment. */
export const TEST_MODE_ENV = {
  STRIPE_MODE: 'test',
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
  STRIPE_PRICE_MONTHLY: 'price_configuredMonthly1',
  STRIPE_PRICE_YEARLY: 'price_configuredYearly12',
  SUPABASE_URL: 'https://p.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-dummy',
  VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_dummy',
  VITE_STRIPE_PRICE_MONTHLY: 'price_configuredMonthly1',
  VITE_STRIPE_PRICE_YEARLY: 'price_configuredYearly12',
} as const

export const ENV_KEYS = [
  ...Object.keys(TEST_MODE_ENV),
  'APP_BASE_URL',
] as const

export function applyTestModeEnv(overrides: Record<string, string | undefined> = {}) {
  for (const k of ENV_KEYS) delete process.env[k]
  for (const [k, v] of Object.entries(TEST_MODE_ENV)) process.env[k] = v
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

export function clearTestModeEnv() {
  for (const k of ENV_KEYS) delete process.env[k]
}
