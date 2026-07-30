import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { CHALLENGES } from './challenges'

/**
 * What this pins is not a size cap — it is the DESIGN.
 *
 * The whole feature rests on progress being derived rather than stored, and the
 * only way that promise can be broken is by someone adding a `progress` column
 * "just to make the page faster". So this asserts the column is not there, in
 * the same spirit as `personalCaps.test.ts` pinning client caps to DB CHECKs:
 * the property is invisible at the call site and expensive to rediscover once
 * violated (a stored counter drifts the first time a task is un-completed, and
 * the only way back is a repair script).
 */

const sql = readFileSync(
  fileURLToPath(
    new URL('../../../supabase/migrations/20260731130000_user_challenges.sql', import.meta.url),
  ),
  'utf8',
)

describe('user_challenges records that you joined, and nothing else', () => {
  it('has NO progress column, in any spelling', () => {
    const raw = /create table if not exists public\.user_challenges \(([\s\S]*?)\n\);/.exec(sql)?.[1]
    expect(raw, 'could not find the table definition').toBeTruthy()
    // COMMENTS STRIPPED FIRST. The column comments explain at length why there
    // is no stored progress, so a naive substring search finds the word in the
    // very prose defending its absence — which is how this test failed the first
    // time it ran.
    const columns = raw!
      .split('\n')
      .map((line) => line.replace(/--.*$/, '').trim())
      .filter(Boolean)
      .join('\n')
      .toLowerCase()

    for (const forbidden of ['progress', 'count', 'streak', 'current_', 'total']) {
      expect(columns, `a "${forbidden}" column would be a stored counter`).not.toContain(forbidden)
    }
    // …and the columns that SHOULD be there still are, so a broken regex cannot
    // make this pass by matching nothing.
    for (const wanted of ['challenge_key', 'started_at', 'completed_at', 'status']) {
      expect(columns).toContain(wanted)
    }
  })

  it('keeps started_at a DATE, because every metric counts whole local days', () => {
    expect(sql).toMatch(/started_at\s+date not null/)
  })

  it('makes a double-tap a no-op but leaves a genuine restart legal', () => {
    // UNIQUE on the DAY, not on the challenge: joining twice this afternoon is
    // one attempt; starting again tomorrow is a different one.
    expect(sql).toMatch(/unique \(user_id, challenge_key, started_at\)/)
  })

  it('will not let a row claim it finished without saying when', () => {
    expect(sql).toContain('user_challenges_completed_shape')
    expect(sql).toMatch(/status = 'completed' and completed_at is not null/)
  })

  it('constrains status to the three the client knows', () => {
    expect(sql).toMatch(/status in \('active', 'completed', 'abandoned'\)/)
  })

  it('does NOT constrain challenge_key — the catalog is client content', () => {
    // A CHECK here would mean a migration every time a challenge is added, and
    // an unknown key is handled kindly in the client instead.
    expect(sql).not.toMatch(/challenge_key in \(/)
  })

  it('keeps the owner-only policy set intact', () => {
    for (const action of ['select', 'insert', 'update', 'delete']) {
      expect(sql, `missing ${action} policy`).toContain(`user_challenges_${action}_own`)
    }
    expect(sql).toContain('user_id = auth.uid()')
    expect(sql).not.toMatch(/to\s+anon/i)
  })

  it('accepts every key the catalog can actually produce', () => {
    // The key column is capped at 40 characters; nothing in the catalog may
    // silently exceed it, because the insert would fail with an opaque 23514.
    const cap = Number(/char_length\(btrim\(challenge_key\)\) between 1 and (\d+)/.exec(sql)![1])
    for (const c of CHALLENGES) {
      expect(c.key.length, `${c.key} is too long for the column`).toBeLessThanOrEqual(cap)
    }
  })
})
