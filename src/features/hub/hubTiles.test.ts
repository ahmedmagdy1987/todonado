import { describe, expect, it } from 'vitest'
import { FEATURES } from '@/lib/config'
import { hubTiles } from './hubTiles'

/**
 * The Hub's failure mode is quiet and nasty: a tile whose route is not mounted
 * hits the catch-all `<Route path="*">` and drops the user on Today with no
 * error. Nothing in the router prevents that — flag gating is duplicated between
 * AppRoutes and this registry — so this file is what keeps the two honest.
 */

const tiles = hubTiles()

/** Every route AppRoutes mounts inside the authenticated shell. */
const MOUNTED_ROUTES = new Set(
  [
    // `/` is a redirect, not a page — Today's own path is what tiles must use.
    '/today',
    '/inbox',
    '/projects',
    '/focus',
    '/insights',
    '/settings',
    '/settings/plan',
    ...(FEATURES.week ? ['/week'] : []),
    ...(FEATURES.getToWork ? ['/work'] : []),
    ...(FEATURES.vision ? ['/vision'] : []),
    ...(FEATURES.vision && FEATURES.mindMaps ? ['/vision/maps'] : []),
    ...(FEATURES.journal ? ['/journal'] : []),
    ...(FEATURES.challenges ? ['/challenges'] : []),
    ...(FEATURES.hub ? ['/hub'] : []),
    ...(FEATURES.wellness
      ? [
          '/wellness',
          '/wellness/breathe',
          '/wellness/sleep',
          '/wellness/meditate',
          '/wellness/tracker',
          ...(FEATURES.quitTracker ? ['/wellness/quit'] : []),
        ]
      : []),
    ...(FEATURES.templates ? ['/templates'] : []),
  ].filter(Boolean),
)

/** Strip the query string — deep links carry one, routes don't. */
const pathOf = (to: string) => to.split('?')[0]

describe('every tile goes somewhere real', () => {
  it('points only at routes that are actually mounted', () => {
    for (const tile of tiles) {
      if (!tile.to) continue
      expect(MOUNTED_ROUTES.has(pathOf(tile.to)), `${tile.id} -> ${tile.to} is not a mounted route`).toBe(
        true,
      )
    }
  })

  it('uses ABSOLUTE paths — the router mounts relative ones, links need absolute', () => {
    for (const tile of tiles) {
      if (tile.to) expect(tile.to.startsWith('/'), `${tile.id}`).toBe(true)
    }
  })

  it('gives a tile either a destination or an honest reason, never neither', () => {
    for (const tile of tiles) {
      const live = !!tile.to
      const soon = !!tile.intentKey
      expect(live !== soon, `${tile.id} must be exactly one of live/not-built`).toBe(true)
      if (soon) {
        expect(tile.soonReason, `${tile.id} needs a reason`).toBeTruthy()
        expect(tile.soonReason!.length).toBeGreaterThan(30)
      }
    }
  })
})

describe('the grid stays a grid', () => {
  it('holds a workable number of tiles', () => {
    // Raised from 15 when mind maps and challenges shipped. The bound exists so
    // the Hub stays a glanceable grid rather than becoming a second sidebar —
    // it is a real limit, not a formality, and the next feature to want a tile
    // should have to argue that it earns one.
    expect(tiles.length).toBeGreaterThanOrEqual(10)
    expect(tiles.length).toBeLessThanOrEqual(17)
  })

  it('has unique ids and unique destinations', () => {
    const ids = tiles.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    const dests = tiles.filter((t) => t.to).map((t) => t.to)
    expect(new Set(dests).size).toBe(dests.length)
  })

  it('keeps labels short — the icon carries the rest', () => {
    for (const tile of tiles) {
      expect(tile.label.split(/\s+/).length, `"${tile.label}" is too long`).toBeLessThanOrEqual(3)
      expect(tile.label.length).toBeLessThanOrEqual(20)
    }
  })

  it('gives every tile a lower-case hint with no full stop', () => {
    for (const tile of tiles) {
      expect(tile.hint.length).toBeGreaterThan(0)
      expect(tile.hint[0]).toBe(tile.hint[0].toLowerCase())
      expect(tile.hint.endsWith('.'), `"${tile.hint}"`).toBe(false)
    }
  })

  it('gives every tile an icon', () => {
    for (const tile of tiles) expect(typeof tile.icon).not.toBe('undefined')
  })
})

describe('it is additive, not a replacement', () => {
  it('still offers Today, so the Hub never becomes a dead end', () => {
    expect(tiles.find((t) => t.to === '/today')).toBeTruthy()
  })

  it('never points at `/`, which only means "wherever this device starts"', () => {
    // A tile pointing at `/` sends a hub-start user straight back to the Hub —
    // and silently drops any query string on the way. Today has its own path.
    for (const tile of tiles) {
      expect(pathOf(tile.to ?? '/x'), `${tile.id}`).not.toBe('/')
    }
  })

  it('never links to itself', () => {
    expect(tiles.some((t) => pathOf(t.to ?? '') === '/hub')).toBe(false)
  })

  it('deep-links carry a query, not a made-up path', () => {
    const deep = tiles.filter((t) => t.to?.includes('?'))
    for (const tile of deep) {
      const [path, query] = tile.to!.split('?')
      expect(MOUNTED_ROUTES.has(path)).toBe(true)
      expect(query.length).toBeGreaterThan(0)
    }
  })
})
