import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPlanOverride } from './plan'

/**
 * THE PRO PREVIEW SWITCH IS A DEVELOPMENT TOOL, and this file is what keeps it
 * one.
 *
 * `localStorage.todonado.plan = 'pro'` exists so either tier can be previewed
 * without a billing backend. It used to be read in EVERY build, which meant the
 * entire paid tier was available to anyone on the production site who opened
 * devtools and typed one line: week planning, Insights, unlimited history,
 * voice notes, every unlimited cap.
 *
 * Worth being precise about the blast radius, because it shapes the fix.
 * Nothing was breached: `resolveServerPlan` reads the `billing` table and
 * ignores this value, so the one server-gated feature (the calendar proxy)
 * stayed gated, and no other user's data was ever reachable. What leaked was
 * revenue, not data. That is still not something to ship on the day billing
 * goes live.
 *
 * `import.meta.env.DEV` is substituted with a literal at build time, so in a
 * production bundle the branch is dead code the minifier deletes outright.
 * There is no key to find and no string to try.
 */

/** A localStorage that exists (the node test env has none) and answers `value`. */
function stubStorage(value: string | null) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === 'todonado.plan' ? value : null),
    setItem: () => {},
    removeItem: () => {},
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('readPlanOverride', () => {
  it('reads the override in a DEVELOPMENT build', () => {
    vi.stubEnv('DEV', true)
    stubStorage('pro')
    expect(readPlanOverride()).toBe('pro')

    stubStorage('free')
    expect(readPlanOverride()).toBe('free')
  })

  it('IGNORES the override in a PRODUCTION build — the whole point of this file', () => {
    vi.stubEnv('DEV', false)
    stubStorage('pro')
    expect(
      readPlanOverride(),
      'a production bundle must not grant Pro from localStorage',
    ).toBeNull()
  })

  it('ignores a downgrade override in production too, not just an upgrade', () => {
    // Symmetry matters: the switch is off in production, it does not merely
    // refuse the generous direction.
    vi.stubEnv('DEV', false)
    stubStorage('free')
    expect(readPlanOverride()).toBeNull()
  })

  it('returns null for junk, and for no value at all, in development', () => {
    vi.stubEnv('DEV', true)
    stubStorage('platinum')
    expect(readPlanOverride()).toBeNull()
    stubStorage(null)
    expect(readPlanOverride()).toBeNull()
  })

  it('survives localStorage being unavailable', () => {
    vi.stubEnv('DEV', true)
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError: storage disabled')
      },
    })
    expect(readPlanOverride()).toBeNull()
  })
})
