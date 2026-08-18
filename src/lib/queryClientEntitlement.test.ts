import { MutationObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerToast } from '@/components/common/toastBridge'
import type { ToastOptions } from '@/components/common/toast-context'
import {
  publishEntitlements,
  resetEntitlementBridge,
} from '@/features/billing/entitlementBridge'
import { ENTITLEMENTS } from '@/features/billing/entitlements'
import { UPGRADE_CTA, UPGRADE_ROUTE } from '@/features/billing/upgradeCopy'
import { queryClient } from './queryClient'

/**
 * THE WHOLE PATH, THROUGH THE REAL HANDLER.
 *
 * The pure decision is covered next door; this drives the actual
 * `MutationCache.onError` on the actual shared `queryClient`, because the wiring
 * is where this feature could still be wrong after the logic is right — a
 * mutation that opts out, a Retry that should not be offered, a toast that
 * carries no route.
 *
 * The rejection value is the payload captured from a real PostgREST round trip
 * (see `entitlementError.test.ts` for the provenance), so what is simulated here
 * is only the network, never the error format.
 */

const FREE_LIMIT_ERROR = {
  code: '23514',
  details: null,
  hint: 'mindMaps',
  message: 'free_limit_reached:mindMaps:3',
}

interface Raised {
  message: string
  options?: ToastOptions
}

let raised: Raised[] = []
let unregister: () => void

beforeEach(() => {
  raised = []
  unregister = registerToast((message, options) => raised.push({ message, options }))
  resetEntitlementBridge()
})

afterEach(() => {
  unregister()
  resetEntitlementBridge()
  vi.restoreAllMocks()
})

/** Run a mutation that fails, exactly as an insert refused by the trigger would. */
async function failingMutation(
  error: unknown,
  meta: { noRetry?: boolean; skipErrorToast?: boolean } = { noRetry: true },
): Promise<{ calls: number }> {
  let calls = 0
  const observer = new MutationObserver<unknown, unknown, { title: string }>(queryClient, {
    mutationFn: async () => {
      calls += 1
      throw error
    },
    meta,
  })
  // The variables a real create carries; their presence is what would normally
  // make a Retry available, so passing them keeps the test honest.
  await observer.mutate({ title: 'a new map' }).catch(() => {})
  return { calls }
}

describe('a Free user whose create is refused by the server', () => {
  beforeEach(() => publishEntitlements({ status: 'resolved', plan: 'free' }))

  it('replaces the generic failure with the specific limit and its reassurance', async () => {
    await failingMutation(FREE_LIMIT_ERROR)

    expect(raised).toHaveLength(1)
    const [toast] = raised
    expect(toast.message).not.toMatch(/something went wrong/i)
    expect(toast.message).toContain(String(ENTITLEMENTS.free.limits.mindMaps))
    expect(toast.message).toContain('mind maps')
    expect(toast.message).toMatch(/stays open and editable/i)
    expect(toast.message).toContain('Pro removes this limit')
  })

  it('offers the upgrade route as a real in-app destination', async () => {
    await failingMutation(FREE_LIMIT_ERROR)

    const action = raised[0]?.options?.action
    expect(action?.label).toBe(UPGRADE_CTA)
    expect(action?.to).toBe(UPGRADE_ROUTE)
  })

  it('offers no Retry, and never re-runs the refused mutation', async () => {
    const { calls } = await failingMutation(FREE_LIMIT_ERROR)

    expect(calls).toBe(1)
    expect(raised[0]?.options?.action?.label).not.toBe('Retry')
  })

  it('gives the user long enough to read three sentences and click', async () => {
    await failingMutation(FREE_LIMIT_ERROR)
    expect(raised[0]?.options?.durationMs ?? 0).toBeGreaterThan(6000)
  })

  /*
   * §7 — the cases the local gate cannot cover. All of them look identical from
   * here: the mutation was ALLOWED to run (so the client's count said there was
   * room) and the server refused it anyway. The recovery must not depend on the
   * client having known better.
   */
  it.each([
    'a second tab created the last one',
    'the local count was stale',
    'another device took the final slot',
    'the call bypassed the local gate',
  ])('recovers correctly when %s', async (scenario) => {
    const { calls } = await failingMutation(FREE_LIMIT_ERROR)

    expect(calls, `${scenario}: the refused mutation must not be re-run`).toBe(1)
    expect(raised[0]?.message, scenario).toContain('Pro removes this limit')
    expect(raised[0]?.options?.action?.to, scenario).toBe(UPGRADE_ROUTE)
  })
})

describe('a Pro user who somehow receives a Free-limit error', () => {
  beforeEach(() => publishEntitlements({ status: 'resolved', plan: 'pro' }))

  it('is shown an ordinary error and is never asked to upgrade', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await failingMutation(FREE_LIMIT_ERROR)

    expect(raised).toHaveLength(1)
    expect(raised[0].message).toMatch(/something went wrong/i)
    expect(raised[0].message).not.toMatch(/pro removes this limit/i)
    expect(raised[0].options?.action?.to).toBeUndefined()
    expect(logged).toHaveBeenCalledOnce()
  })

  it('logs diagnostics naming the feature and both plans', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await failingMutation(FREE_LIMIT_ERROR)

    const [, detail] = logged.mock.calls[0]
    expect(detail).toMatchObject({ feature: 'mindMaps', serverCap: 3, clientPlan: 'pro' })
  })
})

describe('a plan that has not resolved yet', () => {
  it('shows the ordinary error rather than a prompt it cannot justify', async () => {
    // Nothing published: the bridge reads `resolving` by default, which is the
    // state a cold load is in.
    await failingMutation(FREE_LIMIT_ERROR)

    expect(raised).toHaveLength(1)
    expect(raised[0].message).toMatch(/something went wrong/i)
    expect(raised[0].options?.action?.to).toBeUndefined()
  })
})

describe('everything that is not a commercial limit is untouched', () => {
  beforeEach(() => publishEntitlements({ status: 'resolved', plan: 'free' }))

  it('still reports a real database error as an error', async () => {
    await failingMutation({ code: '42501', message: 'permission denied for table mind_maps' })

    expect(raised).toHaveLength(1)
    expect(raised[0].message).toMatch(/something went wrong/i)
    expect(raised[0].options?.action?.to).toBeUndefined()
  })

  it('still offers Retry to a retriable mutation', async () => {
    await failingMutation(new TypeError('Failed to fetch'), { noRetry: false })

    expect(raised[0]?.options?.action?.label).toBe('Retry')
  })

  it('still honours a flow that renders its own error', async () => {
    await failingMutation(FREE_LIMIT_ERROR, { skipErrorToast: true })

    expect(raised).toHaveLength(0)
  })
})
