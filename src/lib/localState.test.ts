import { describe, expect, it } from 'vitest'
import { clearAccountLocalState } from './localState'

/**
 * Signing out must not leave the previous account's traces on a shared browser,
 * and must not reset the browser's own settings while doing it.
 */

/** A Storage that behaves like the real one, including the index shifting. */
function fakeStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries))
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage
}

const ACCOUNT = {
  'todonado.plan': 'pro',
  'todonado.planScope.11111111-2222-3333-4444-555555555555': 'all',
  'todonado.planScope.99999999-8888-7777-6666-555555555555': 'dated',
  'todonado.digest.dismissed': '2026-07-31',
  'todonado.lastActiveDay': '2026-07-31',
  'todonado.pomodoro': '{"cycle":2}',
}

describe('clearAccountLocalState', () => {
  it('removes every account-scoped key', () => {
    const storage = fakeStorage({ ...ACCOUNT })
    const removed = clearAccountLocalState(storage)
    expect(removed.sort()).toEqual(Object.keys(ACCOUNT).sort())
    expect(storage.length).toBe(0)
  })

  it('REMOVES EVERY KEY, not every other one', () => {
    /*
     * The trap this pins: removing while walking `storage.key(i)` shifts the
     * indices underneath the loop, so a naive implementation deletes the 1st,
     * 3rd, 5th… and leaves the rest. With six keys that looks like it worked.
     */
    const storage = fakeStorage({ ...ACCOUNT })
    clearAccountLocalState(storage)
    for (const key of Object.keys(ACCOUNT)) {
      expect(storage.getItem(key), `${key} survived sign-out`).toBeNull()
    }
  })

  it('KEEPS todonado.prefs — those belong to the device, not the account', () => {
    // Wiping these would reset a shared laptop's sound settings every time
    // anybody signed out, which is worse than the remanence being fixed here.
    const storage = fakeStorage({ ...ACCOUNT, 'todonado.prefs': '{"sound":false}' })
    const removed = clearAccountLocalState(storage)
    expect(removed).not.toContain('todonado.prefs')
    expect(storage.getItem('todonado.prefs')).toBe('{"sound":false}')
  })

  it('never touches keys outside the namespace', () => {
    const storage = fakeStorage({ ...ACCOUNT, 'sb-auth-token': 'x', theme: 'dark' })
    clearAccountLocalState(storage)
    expect(storage.getItem('sb-auth-token')).toBe('x')
    expect(storage.getItem('theme')).toBe('dark')
  })

  it('does nothing, loudly or otherwise, when storage is unavailable', () => {
    expect(clearAccountLocalState(undefined)).toEqual([])
    const hostile = {
      get length(): number {
        throw new Error('SecurityError')
      },
    } as unknown as Storage
    expect(() => clearAccountLocalState(hostile)).not.toThrow()
  })
})
