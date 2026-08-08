import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { queryClient } from '@/lib/queryClient'

/**
 * A PER-SECOND VISUAL TIMER MUST NEVER CAUSE A PER-SECOND DATABASE QUERY.
 *
 * ── WHY THIS IS A TEST AND NOT A NOTE ──────────────────────────────────────
 *
 * `RunningView` re-renders once a second for as long as a session is on screen,
 * and it re-renders again for every tick of the optional countdown sound. It
 * also consumes `useFocusSessions`, which is a network query. Nothing in
 * TypeScript connects those two facts, so the day somebody adds a
 * `refetchInterval` "so the timer stays fresh", or drops `staleTime` to zero,
 * every open Focus tab starts issuing 1,500 requests per 25-minute sprint and
 * the build stays green.
 *
 * The observed behaviour these lock in, measured from the network panel:
 *
 *   Opening /focus            1 GET  (the query mounts)
 *   Every second thereafter   0
 *   Start / Pause / Resume    1 GET each — the mutation's `onSettled`
 *   Log an interruption       1 GET
 *   End (or completion)       1 GET
 *
 * So the GETs are one-per-USER-ACTION, which is what a burst looks like while
 * somebody is testing pause and resume repeatedly. It is not the timer.
 *
 * The traffic is asserted STRUCTURALLY — by reading the source — because the
 * unit suite runs in `node` with no DOM, so the component cannot be rendered
 * and a request cannot be counted. Structure is what would have to change for
 * the behaviour to change, so it is the thing worth pinning.
 */

const root = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

/**
 * Strip comments and string/template literals before scanning.
 *
 * Every one of these files EXPLAINS the options it deliberately does not use, so
 * a naive text search finds `refetchInterval` in the prose that exists to warn
 * against it and fails. This repo has been bitten by that on three separate
 * occasions; scan code, never prose.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
}

describe('the shared query client cannot poll', () => {
  it('has no refetch interval and does not refetch on window focus', () => {
    const q = queryClient.getDefaultOptions().queries ?? {}
    // `refetchInterval` unset is the only acceptable value: any number here
    // polls EVERY query in the app, not just this one.
    expect(q.refetchInterval).toBeUndefined()
    expect(q.refetchOnWindowFocus).toBe(false)
  })

  it('keeps a real staleTime, so remounting a screen does not refetch', () => {
    // Seven components read `useFocusSessions` (Today, Focus, Insights, the task
    // list, the effort suggester, Challenges, the session summary). They share
    // one key and dedupe, but with `staleTime: 0` every navigation between them
    // would refetch.
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBeGreaterThanOrEqual(10_000)
  })
})

describe('the focus query itself does not poll', () => {
  const source = codeOnly(read('features/focus/api/useFocusSessions.ts'))

  it('declares no refetchInterval, and no per-mount or per-focus refetch', () => {
    for (const option of ['refetchInterval', 'refetchOnMount', 'refetchOnWindowFocus', 'refetchOnReconnect']) {
      expect(source, option).not.toContain(option)
    }
  })

  it('refetches only from a mutation settling — no other invalidation path', () => {
    // One `invalidateQueries`, reached only from `onSettled`. That is the whole
    // reason a GET appears next to a Pause click, and the only reason.
    expect(source.match(/invalidateQueries/g) ?? []).toHaveLength(1)
    expect(source.match(/onSettled/g) ?? []).toHaveLength(2)
  })
})

describe('the per-second render path touches no network', () => {
  // `useNow` drives the re-render; `timer` and `ticking` are what it recomputes.
  // If any of them ever imports a client or a query hook, the tick becomes a
  // request.
  for (const file of ['features/focus/useNow.ts', 'features/focus/timer.ts', 'features/focus/ticking.ts']) {
    it(`${file} imports nothing that can reach the network`, () => {
      const source = codeOnly(read(file))
      for (const forbidden of ['supabase', '@tanstack/react-query', 'fetch(', 'useFocusSessions']) {
        expect(source, forbidden).not.toContain(forbidden)
      }
    })
  }

  it('the running view never invalidates or refetches from a render', () => {
    // Its only writes go through `patchSession`/`endSession`, whose `onSettled`
    // owns the single refetch. A direct call here would fire from the tick.
    const source = codeOnly(read('features/focus/components/RunningView.tsx'))
    expect(source).not.toContain('invalidateQueries')
    expect(source).not.toContain('refetch')
    expect(source).not.toContain('refetchInterval')
  })

  it('realtime does not subscribe to focus_sessions', () => {
    // A postgres_changes subscription on this table would invalidate the key on
    // every write — including this device's own — turning one Pause into two
    // GETs, and a second open tab into a feedback loop.
    const source = codeOnly(read('features/tasks/api/useRealtimeSync.ts'))
    expect(source).not.toContain('focus_sessions')
  })
})

describe('the countdown tick is driven by the render, not by a second clock', () => {
  it('creates no interval or timeout of its own anywhere in the feature', () => {
    // The whole ticking design rests on there being exactly ONE timing source.
    // A second one would drift from the number on screen and would keep running
    // after unmount.
    for (const file of ['features/focus/ticking.ts', 'features/focus/sound.ts']) {
      const source = codeOnly(read(file))
      expect(source, file).not.toContain('setInterval')
      expect(source, file).not.toContain('setTimeout')
    }
  })

  it('useNow owns the only interval, and clears it', () => {
    const source = codeOnly(read('features/focus/useNow.ts'))
    expect(source.match(/setInterval/g) ?? []).toHaveLength(1)
    expect(source).toContain('clearInterval')
  })
})
