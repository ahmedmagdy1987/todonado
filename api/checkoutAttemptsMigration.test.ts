import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The durable-checkout guarantees live in SQL, so this is what pins them.
 *
 * The concurrency properties — one open attempt per user across separate Vercel
 * instances, and consume-and-bind as one unit — come from a PARTIAL UNIQUE INDEX
 * and `select … for update`. No unit test can exercise either, so each is
 * asserted here against the migration text, clause by clause.
 */

const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/20260801150000_checkout_attempts.sql', import.meta.url)),
  'utf8',
)
const flat = sql.replace(/\s+/g, ' ')

describe('20260801150000_checkout_attempts — the table', () => {
  it('is owned by auth.users and cascades on account deletion', () => {
    expect(flat).toContain('user_id uuid not null references auth.users (id) on delete cascade')
  })

  it('has a server-generated unguessable primary key', () => {
    // gen_random_uuid() is CSPRNG-backed. This id is put in Stripe metadata and
    // is the only thing that proves a session came from a checkout WE started.
    expect(flat).toContain('id uuid primary key default gen_random_uuid()')
  })

  it('constrains status to the documented state machine', () => {
    for (const s of ['reserved', 'session_created', 'completed', 'consumed', 'expired', 'failed']) {
      expect(flat, `status '${s}' must be permitted`).toContain(`'${s}'`)
    }
    expect(flat).toContain('check (status in (')
  })

  it('ENFORCES one non-terminal attempt per user IN THE DATABASE', () => {
    // The whole cross-instance guarantee. An application-level check would have
    // a gap between the check and the insert.
    expect(flat).toContain('create unique index if not exists checkout_attempts_one_open_per_user')
    expect(flat).toContain(
      "on public.checkout_attempts (user_id) where status in ('reserved', 'session_created', 'completed')",
    )
  })

  it('is SERVER-ONLY — RLS on, and no policy of any kind', () => {
    expect(flat).toContain('alter table public.checkout_attempts enable row level security')
    expect(flat).toContain('revoke all on table public.checkout_attempts from anon, authenticated')
    // A select policy would expose another user's Checkout Session id.
    expect(
      /create policy[\s\S]*checkout_attempts/.test(sql),
      'checkout_attempts must have NO policy — every access is service-role',
    ).toBe(false)
  })
})

describe('20260801150000_checkout_attempts — reserve_checkout_attempt', () => {
  it('returns an existing open attempt instead of starting a second', () => {
    expect(flat).toContain("where user_id = p_user_id and status in ('reserved', 'session_created', 'completed') for update")
  })

  it('adopts the winner when it loses the insert race', () => {
    // Without this a concurrent caller would get a 23505 and a 500 instead of
    // the session the other request just reserved.
    expect(flat).toContain('exception when unique_violation then')
  })
})

describe('20260801150000_checkout_attempts — bind_verified_checkout', () => {
  it('locks the attempt before deciding anything', () => {
    expect(flat).toContain('from public.checkout_attempts where id = p_attempt_id for update')
  })

  it('fails closed on an attempt id we never issued', () => {
    expect(flat).toContain("return 'unknown_attempt'")
  })

  it('refuses a SECOND session trying to consume the same attempt', () => {
    expect(flat).toContain("return 'attempt_already_consumed'")
  })

  it('refuses a purchase whose price is not what the attempt reserved', () => {
    expect(flat).toContain('attempt.price_id is distinct from p_price_id')
    expect(flat).toContain("return 'attempt_price_mismatch'")
  })

  it('refuses an attempt that already reached a terminal state', () => {
    expect(flat).toContain("return 'attempt_not_open'")
  })

  it('DELEGATES the ordering rules rather than re-implementing them', () => {
    // Two implementations of the ordering rules is exactly the defect that made
    // the previous webhook non-atomic.
    expect(flat).toContain('outcome := public.apply_stripe_billing_event(')
    expect(flat).not.toContain("return 'stale_downgrade'")
  })

  it('consumes the attempt in the SAME function as the billing write', () => {
    expect(flat).toMatch(
      /update public\.checkout_attempts set status = 'consumed'[\s\S]*apply_stripe_billing_event/,
    )
  })
})

describe('20260801150000_checkout_attempts — apply_stripe_subscription_event', () => {
  it('resolves identity by the SUBSCRIPTION we bound, never by metadata', () => {
    expect(flat).toContain('from public.billing where stripe_subscription_id = p_subscription_id for update')
  })

  it('writes NOTHING for a subscription we do not hold', () => {
    // This is what keeps HBV Studio's other products out of Todonado billing.
    expect(flat).toContain("return 'unknown_subscription'")
  })

  it('cannot create a binding — it only ever updates an existing one', () => {
    const fn = /create or replace function public\.apply_stripe_subscription_event[\s\S]*?\$\$;/.exec(sql)?.[0] ?? ''
    expect(fn).not.toMatch(/insert into public\.billing/)
  })

  it('delegates the ordering rules too', () => {
    expect(flat).toContain('return public.apply_stripe_billing_event(')
  })
})

describe('20260801150000_checkout_attempts — exposure', () => {
  it('every function is SECURITY DEFINER with a pinned search_path', () => {
    const defs = sql.match(/create or replace function/g) ?? []
    const definers = sql.match(/security definer/g) ?? []
    const paths = sql.match(/set search_path = public/g) ?? []
    expect(definers.length).toBe(defs.length)
    expect(paths.length).toBe(defs.length)
  })

  it('revokes from PUBLIC, not just anon and authenticated', () => {
    /*
     * PostgreSQL grants EXECUTE to PUBLIC on CREATE FUNCTION. Revoking only
     * anon and authenticated leaves every function callable by anybody, and
     * executing the migration against a real database is what showed it: with
     * the PUBLIC revoke removed, four privilege tests turn red.
     */
    expect(flat).toContain('from public, anon, authenticated, service_role')
  })

  it('GRANTS execute to service_role explicitly, rather than inheriting it', () => {
    /*
     * Access was previously arriving from Supabase's ALTER DEFAULT PRIVILEGES.
     * It worked, but a change to those defaults would have removed the money
     * path's database access with no code change.
     */
    expect(flat).toContain('grant execute on function %s to service_role')
  })

  it('names every function in the privilege loop', () => {
    for (const fn of [
      'reserve_checkout_attempt',
      'mark_checkout_attempt',
      'bind_verified_checkout',
      'apply_stripe_subscription_event',
      // Declared here so 20260801140000 stays exactly as reviewed.
      'apply_stripe_billing_event',
    ]) {
      expect(flat, `${fn} must be in the privilege loop`).toContain(`public.${fn}(`)
    }
  })

  it('removes DIRECT table access from service_role too', () => {
    // Every access goes through the SECURITY DEFINER functions.
    expect(flat).toContain('revoke all on table public.checkout_attempts from service_role')
  })

  it('ENTITLEMENT is a parameter, not a hard-coded grant', () => {
    /*
     * bind_verified_checkout used to pass a literal 'pro'. A Session can be
     * complete while its Subscription is incomplete, unpaid, paused or already
     * canceled; binding and granting are different decisions.
     */
    expect(flat).toContain('p_plan text')
    expect(flat).toContain("if p_plan not in ('free', 'pro')")
    expect(flat).not.toMatch(/apply_stripe_billing_event\( attempt\.user_id, p_event_id, p_event_at, 'pro'/)
  })

  it('the REAL privilege proof is the database job, not this file', () => {
    // Stated so nobody mistakes text matching for evidence. db-tests/
    // permissions.db.test.ts reads has_function_privilege on a live database.
    expect(flat).toContain('revoke all on function')
  })
})
