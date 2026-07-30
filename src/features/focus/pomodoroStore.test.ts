import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PomodoroChain } from './pomodoro'
import { readChain, writeChain } from './pomodoroStore'

/**
 * The store is thin, but the thing it must never do is throw. A user in private
 * mode, or with storage disabled, or with a half-written value from an older
 * build, has to land on "no chain in progress" — not on a blank Focus page. The
 * suite runs in the `node` environment, so `window` is stubbed rather than
 * assumed.
 */

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    /** test-only peek */
    _map: map,
  }
}

function withStorage(store: ReturnType<typeof fakeStorage>) {
  vi.stubGlobal('window', { localStorage: store })
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const chain: PomodoroChain = {
  sessionId: 'session-1',
  taskId: 'task-1',
  completed: 3,
  break: { kind: 'long-break', minutes: 15, startedAtMs: 1_700_000_000_000 },
}

describe('round trip', () => {
  it('writes and reads back an identical chain', () => {
    withStorage(fakeStorage())
    writeChain(chain)
    expect(readChain()).toEqual(chain)
  })

  it('reads null when nothing was ever written', () => {
    withStorage(fakeStorage())
    expect(readChain()).toBeNull()
  })

  it('clears the key when written null', () => {
    const store = withStorage(fakeStorage())
    writeChain(chain)
    writeChain(null)
    expect(readChain()).toBeNull()
    expect(store._map.size).toBe(0)
  })

  it('round-trips a working chain with no break and no task', () => {
    withStorage(fakeStorage())
    const working: PomodoroChain = { sessionId: 's', taskId: null, completed: 0, break: null }
    writeChain(working)
    expect(readChain()).toEqual(working)
  })
})

describe('never trusts what it reads', () => {
  const bad = [
    ['not JSON at all', '{{{'],
    ['a JSON scalar', '42'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a missing count', '{"sessionId":"s","break":null}'],
    ['a negative count', '{"sessionId":"s","completed":-1,"break":null}'],
    ['a non-numeric count', '{"sessionId":"s","completed":"3","break":null}'],
    ['a non-string sessionId', '{"sessionId":7,"completed":1,"break":null}'],
    ['a non-string taskId', '{"sessionId":"s","taskId":7,"completed":1,"break":null}'],
    ['an unknown break kind', '{"sessionId":"s","completed":1,"break":{"kind":"nap","minutes":5,"startedAtMs":1}}'],
    ['a break with no timestamp', '{"sessionId":"s","completed":1,"break":{"kind":"break","minutes":5}}'],
    ['a break with a negative length', '{"sessionId":"s","completed":1,"break":{"kind":"break","minutes":-5,"startedAtMs":1}}'],
    ['a NaN timestamp', '{"sessionId":"s","completed":1,"break":{"kind":"break","minutes":5,"startedAtMs":null}}'],
  ] as const

  for (const [label, raw] of bad) {
    it(`rejects ${label} without throwing`, () => {
      withStorage(fakeStorage({ 'todonado.pomodoro': raw }))
      expect(() => readChain()).not.toThrow()
      expect(readChain()).toBeNull()
    })
  }

  it('treats a missing taskId (an older build) as general focus rather than rejecting', () => {
    withStorage(fakeStorage({ 'todonado.pomodoro': '{"sessionId":"s","completed":2,"break":null}' }))
    expect(readChain()).toEqual({ sessionId: 's', taskId: null, completed: 2, break: null })
  })
})

describe('survives storage being unavailable', () => {
  it('reads null when getItem throws', () => {
    withStorage({
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {},
      removeItem: () => {},
      _map: new Map(),
    } as unknown as ReturnType<typeof fakeStorage>)
    expect(() => readChain()).not.toThrow()
    expect(readChain()).toBeNull()
  })

  it('swallows a quota error on write', () => {
    withStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
      _map: new Map(),
    } as unknown as ReturnType<typeof fakeStorage>)
    expect(() => writeChain(chain)).not.toThrow()
  })
})
