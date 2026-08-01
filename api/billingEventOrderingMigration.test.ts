import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The ordering rules live in SQL and NOWHERE ELSE, so this is what pins them.
 *
 * They used to also exist as a TypeScript function that the handler called
 * between a SELECT and an UPDATE. That was two implementations of one rule set
 * and, worse, the JavaScript one evaluated the downgrade guards against a
 * SNAPSHOT — two Vercel instances that both read `plan='free'` each skipped the
 * subscription-id check, and a cancel for an old subscription could revoke
 * access bought seconds earlier (reproduced in stripeWebhookConcurrency.test.ts).
 *
 * The decision now happens inside `apply_stripe_billing_event` under
 * `select … for update`. Nothing in JavaScript can be unit-tested about it, so
 * this file reads the migration and asserts each rule is present — the same
 * approach `src/lib/limits.test.ts` and `challengeMigration.test.ts` already use
 * for constraints that TypeScript cannot see.
 *
 * These assertions are deliberately CLAUSE BY CLAUSE. A single "does the file
 * mention the function" check would pass against a stub, which is exactly the
 * "a guard that checks a subset reports on the subset" trap this repo has
 * recorded three times now.
 */

const sql = readFileSync(
  fileURLToPath(
    new URL(
      '../supabase/migrations/20260801140000_billing_event_ordering.sql',
      import.meta.url,
    ),
  ),
  'utf8',
)

const normalised = sql.replace(/\s+/g, ' ')

describe('20260801140000_billing_event_ordering — the columns', () => {
  it('adds both high-water-mark columns idempotently', () => {
    expect(normalised).toContain('add column if not exists last_stripe_event_id text')
    expect(normalised).toContain('add column if not exists last_stripe_event_at timestamptz')
  })

  it('adds them as NULLABLE with no default, so it cannot fail on existing rows', () => {
    // A NOT NULL or a DEFAULT would turn a catalog-only change into a table
    // rewrite that validates every row — the failure mode FLAG-9's CHECK
    // migration had to be careful about.
    const alter = /alter table public\.billing([\s\S]*?);/.exec(sql)?.[1] ?? ''
    expect(alter).not.toMatch(/not null/i)
    expect(alter).not.toMatch(/default/i)
  })
})

describe('20260801140000_billing_event_ordering — the atomic function', () => {
  it('exists and returns the outcome as text', () => {
    expect(normalised).toContain('create or replace function public.apply_stripe_billing_event')
    expect(normalised).toContain(') returns text')
  })

  it('TAKES A ROW LOCK — this is the whole point of moving the decision into SQL', () => {
    expect(
      normalised,
      'without `for update` two instances can still interleave a read and a write',
    ).toContain('from public.billing where user_id = p_user_id for update')
  })

  it('runs SECURITY DEFINER with a pinned search_path', () => {
    expect(normalised).toContain('security definer')
    // An unpinned search_path on a SECURITY DEFINER function is a privilege
    // escalation primitive.
    expect(normalised).toContain('set search_path = public')
  })

  it('is not reachable by anon or authenticated callers', () => {
    expect(normalised).toMatch(/revoke all on function public\.apply_stripe_billing_event/)
    expect(normalised).toMatch(/from public, anon, authenticated/)
  })

  it('validates the plan rather than trusting the caller', () => {
    expect(normalised).toContain("if p_plan not in ('free', 'pro')")
  })
})

describe('20260801140000_billing_event_ordering — each rule, individually', () => {
  it('RULE 1 — de-duplicates on the event id', () => {
    expect(normalised).toContain('cur.last_stripe_event_id is not distinct from p_event_id')
    expect(normalised).toContain("return 'duplicate_event'")
  })

  it('RULE 2 — drops an event older than the high-water mark', () => {
    expect(normalised).toContain('p_event_at < cur.last_stripe_event_at')
    expect(normalised).toContain("return 'stale_event'")
  })

  it('RULE 3a — a downgrade that merely TIES the mark is refused', () => {
    // `<=`, not `<`. event.created has second precision, so a cancel and the
    // renewal that superseded it can share a timestamp; a tie must never
    // revoke access.
    expect(normalised).toContain('p_event_at <= cur.last_stripe_event_at')
    expect(normalised).toContain("return 'stale_downgrade'")
  })

  it('RULE 3b — a downgrade must name the subscription currently held', () => {
    expect(normalised).toContain('cur.stripe_subscription_id <> p_subscription_id')
    expect(normalised).toContain("return 'downgrade_for_other_subscription'")
  })

  it('the downgrade rules apply ONLY to downgrades', () => {
    expect(normalised).toContain("is_downgrade := (p_plan = 'free' and cur.plan = 'pro')")
  })

  it('the tie rule is STRICTER than the ordering rule, not equal to it', () => {
    // If both used `<`, a tie would let a downgrade through. If both used `<=`,
    // a legitimate same-second upgrade would be dropped. The asymmetry is the
    // policy, so pin that they differ.
    expect(normalised).toContain('p_event_at < cur.last_stripe_event_at')
    expect(normalised).toContain('p_event_at <= cur.last_stripe_event_at')
  })
})

describe('20260801140000_billing_event_ordering — the write itself', () => {
  it('handles a first-ever event with a conflict-safe insert', () => {
    expect(normalised).toContain('on conflict (user_id) do nothing')
    // …and re-reads under the lock when it loses that race, rather than
    // returning a success it did not achieve.
    expect(normalised).toMatch(
      /on conflict \(user_id\) do nothing;.*select \* into cur from public\.billing where user_id = p_user_id for update/,
    )
  })

  it('never nulls a customer or subscription id it was not given', () => {
    expect(normalised).toContain('stripe_customer_id = coalesce(p_customer_id, stripe_customer_id)')
    expect(normalised).toContain(
      'stripe_subscription_id = coalesce(p_subscription_id, stripe_subscription_id)',
    )
  })

  it('only writes current_period_end when the event actually carried one', () => {
    // checkout.session.completed has no period end. Writing NULL would erase
    // what customer.subscription.updated already stored.
    expect(normalised).toContain(
      'case when p_set_period_end then p_period_end else current_period_end end',
    )
  })

  it('always advances the high-water mark when it applies', () => {
    // `normalised` collapses runs of whitespace, so the column alignment in
    // the source becomes single spaces here.
    expect(normalised).toContain('last_stripe_event_id = p_event_id')
    expect(normalised).toContain('last_stripe_event_at = p_event_at')
  })
})
