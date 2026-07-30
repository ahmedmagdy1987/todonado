import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHIME_TONES,
  DEFAULT_PREFS,
  getPrefs,
  parsePrefs,
  resetPrefsCache,
  setPrefs,
} from './prefs'

/**
 * Preferences must NEVER throw and must never lose more than the one field that
 * was bad. A user in private mode, or with a value written by an older build,
 * has to land on a working Settings page — not a blank one.
 */

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  }
}

function withStorage(store: ReturnType<typeof fakeStorage>) {
  vi.stubGlobal('window', { localStorage: store })
  resetPrefsCache()
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetPrefsCache()
})

describe('defaults', () => {
  it('starts with sound ON at a reasonable volume', () => {
    // Off-by-default would make the chime toggles in Focus look broken.
    expect(DEFAULT_PREFS.sound).toBe(true)
    expect(DEFAULT_PREFS.volume).toBeGreaterThan(0)
    expect(DEFAULT_PREFS.volume).toBeLessThanOrEqual(1)
  })

  it('shows the briefing and celebrations by default', () => {
    expect(DEFAULT_PREFS.digestHidden).toBe(false)
    expect(DEFAULT_PREFS.celebrations).toBe(true)
  })

  it('defaults to a tone that actually exists', () => {
    expect(CHIME_TONES.map((t) => t.id)).toContain(DEFAULT_PREFS.tone)
  })
})

describe('parsePrefs validates every field independently', () => {
  it('accepts a complete, valid object', () => {
    const input = {
      sound: false,
      volume: 0.25,
      tone: 'bell',
      digestHidden: true,
      celebrations: false,
      startOn: 'hub',
    }
    expect(parsePrefs(input)).toEqual(input)
  })

  it('defaults the start screen to Today, and only accepts the two real screens', () => {
    // Today staying the default matters: the activation flow that is known to
    // work lands there, and an unrecognised value must not silently move it.
    expect(parsePrefs({}).startOn).toBe('today')
    expect(parsePrefs({ startOn: 'hub' }).startOn).toBe('hub')
    expect(parsePrefs({ startOn: 'today' }).startOn).toBe('today')
    for (const junk of ['HUB', 'inbox', '', 3, null, true]) {
      expect(parsePrefs({ startOn: junk }).startOn, `${String(junk)}`).toBe('today')
    }
  })

  it('falls back per FIELD, never wholesale', () => {
    // One bad value must not reset the other four.
    const parsed = parsePrefs({ sound: false, volume: 'loud', tone: 'bell', celebrations: false })
    expect(parsed.sound).toBe(false)
    expect(parsed.tone).toBe('bell')
    expect(parsed.celebrations).toBe(false)
    expect(parsed.volume).toBe(DEFAULT_PREFS.volume)
  })

  it('clamps the volume into 0..1 instead of rejecting it', () => {
    expect(parsePrefs({ volume: 5 }).volume).toBe(1)
    expect(parsePrefs({ volume: -3 }).volume).toBe(0)
    expect(parsePrefs({ volume: Number.NaN }).volume).toBe(DEFAULT_PREFS.volume)
    expect(parsePrefs({ volume: Infinity }).volume).toBe(DEFAULT_PREFS.volume)
  })

  it('rejects an unknown tone rather than trying to play it', () => {
    expect(parsePrefs({ tone: 'airhorn' }).tone).toBe(DEFAULT_PREFS.tone)
    expect(parsePrefs({ tone: 42 }).tone).toBe(DEFAULT_PREFS.tone)
  })

  it('survives every shape of garbage', () => {
    for (const junk of [null, undefined, 42, 'nope', [], true]) {
      expect(() => parsePrefs(junk)).not.toThrow()
      expect(parsePrefs(junk)).toEqual(DEFAULT_PREFS)
    }
  })
})

describe('the store', () => {
  it('reads what was written', () => {
    withStorage(fakeStorage())
    setPrefs({ sound: false, volume: 0.2 })
    expect(getPrefs().sound).toBe(false)
    expect(getPrefs().volume).toBe(0.2)
  })

  it('patches without clobbering the other fields', () => {
    withStorage(fakeStorage())
    setPrefs({ tone: 'low' })
    setPrefs({ celebrations: false })
    expect(getPrefs()).toEqual({ ...DEFAULT_PREFS, tone: 'low', celebrations: false })
  })

  it('persists across a cold read', () => {
    const store = withStorage(fakeStorage())
    setPrefs({ tone: 'bell', digestHidden: true })
    // Simulate a reload: same storage, fresh in-memory cache.
    withStorage(store)
    expect(getPrefs().tone).toBe('bell')
    expect(getPrefs().digestHidden).toBe(true)
  })

  it('recovers from a corrupt stored value', () => {
    withStorage(fakeStorage({ 'todonado.prefs': '{{{not json' }))
    expect(() => getPrefs()).not.toThrow()
    expect(getPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('reflects each write immediately on the next read', () => {
    // NOTE the scope: `subscribe` is module-private and `usePrefs` needs React,
    // so this asserts the store's VALUE contract only — the notification of
    // subscribers is covered end-to-end instead (e2e/hub.spec.ts flips the
    // start-screen radio and e2e/share.spec.ts the sound switch, both of which
    // only work if consumers actually re-render).
    withStorage(fakeStorage())
    setPrefs({ sound: false })
    expect(getPrefs().sound).toBe(false)
    setPrefs({ sound: true })
    expect(getPrefs().sound).toBe(true)
  })

  it('never throws when storage is unavailable', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied')
        },
        setItem: () => {
          throw new Error('quota')
        },
        removeItem: () => {},
      },
    })
    resetPrefsCache()
    expect(() => getPrefs()).not.toThrow()
    expect(getPrefs()).toEqual(DEFAULT_PREFS)
    expect(() => setPrefs({ sound: false })).not.toThrow()
    // The in-memory value still holds for this session even though the write failed.
    expect(getPrefs().sound).toBe(false)
  })
})

describe('the tone catalogue', () => {
  it('has unique ids and a label for each', () => {
    const ids = CHIME_TONES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of CHIME_TONES) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  it('stays small — these are synthesised, not a sound library', () => {
    expect(CHIME_TONES.length).toBeLessThanOrEqual(5)
  })
})
