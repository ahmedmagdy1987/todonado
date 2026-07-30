import { useSyncExternalStore } from 'react'

/**
 * Device-local app preferences.
 *
 * WHY LOCALSTORAGE AND NOT A `profiles` COLUMN. Every one of these is a property
 * of THIS device, not of the account: which machine is allowed to make a noise,
 * how loud, and what this browser shows. Syncing "sounds off" from a quiet
 * office laptop to a phone would be the wrong behaviour, not a missing feature.
 * It also means no migration and no write on every toggle.
 *
 * It follows the repo's existing convention (`todonado.<key>`, hand-rolled
 * read/write in try/catch, see useDigestDismissal / useTaskViewPrefs) rather than
 * inventing a storage abstraction for five booleans.
 *
 * The store is module-level with `useSyncExternalStore` subscribers, because
 * these are read from places that are NOT React — `playEndTone()` is called from
 * a timer callback — and from components scattered across four features. A
 * context provider would have solved only the second half.
 */

export const CHIME_TONES = [
  { id: 'soft', label: 'Soft', description: 'Two gentle notes rising.' },
  { id: 'bell', label: 'Bell', description: 'One clear note with a long tail.' },
  { id: 'low', label: 'Low', description: 'A quiet pair, an octave down.' },
] as const

export type ChimeToneId = (typeof CHIME_TONES)[number]['id']

export interface AppPrefs {
  /** Master switch. Off means silence everywhere, whatever a local toggle says. */
  sound: boolean
  /** 0..1. */
  volume: number
  tone: ChimeToneId
  /** Hide the "Start your day" briefing entirely (distinct from dismissing today's). */
  digestHidden: boolean
  /** In-app milestone celebrations (quit-habit milestones today). */
  celebrations: boolean
  /**
   * Which screen `/` shows. 'today' is the default and stays the default: the
   * first-run flow that is known to work lands on Today, and nothing should
   * change that for a user who never asked.
   */
  startOn: StartScreen
}

/** Where the app opens. */
export type StartScreen = 'today' | 'hub'

export const DEFAULT_PREFS: AppPrefs = {
  sound: true,
  volume: 0.6,
  tone: 'soft',
  digestHidden: false,
  celebrations: true,
  startOn: 'today',
}

const KEY = 'todonado.prefs'

function isToneId(v: unknown): v is ChimeToneId {
  return typeof v === 'string' && CHIME_TONES.some((t) => t.id === v)
}

/** Every field validated independently, so one bad value can't lose the rest. */
export function parsePrefs(raw: unknown): AppPrefs {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS }
  const r = raw as Record<string, unknown>
  return {
    sound: typeof r.sound === 'boolean' ? r.sound : DEFAULT_PREFS.sound,
    volume:
      typeof r.volume === 'number' && Number.isFinite(r.volume)
        ? Math.min(1, Math.max(0, r.volume))
        : DEFAULT_PREFS.volume,
    tone: isToneId(r.tone) ? r.tone : DEFAULT_PREFS.tone,
    digestHidden: typeof r.digestHidden === 'boolean' ? r.digestHidden : DEFAULT_PREFS.digestHidden,
    celebrations:
      typeof r.celebrations === 'boolean' ? r.celebrations : DEFAULT_PREFS.celebrations,
    startOn: r.startOn === 'hub' || r.startOn === 'today' ? r.startOn : DEFAULT_PREFS.startOn,
  }
}

function read(): AppPrefs {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? parsePrefs(JSON.parse(raw)) : { ...DEFAULT_PREFS }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function write(prefs: AppPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable — the in-memory value below still holds for this session
  }
}

// --- the store --------------------------------------------------------------

let current: AppPrefs | null = null
const listeners = new Set<() => void>()

/** Read without React. Safe to call from a timer callback or an audio path. */
export function getPrefs(): AppPrefs {
  if (current === null) current = read()
  return current
}

export function setPrefs(patch: Partial<AppPrefs>): void {
  const next = { ...getPrefs(), ...patch }
  current = next
  write(next)
  for (const l of listeners) l()
}

/** Test-only reset, so a suite doesn't inherit another test's store. */
export function resetPrefsCache(): void {
  current = null
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Live prefs in a component. Re-renders every consumer when any of them change. */
export function usePrefs(): AppPrefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS)
}
