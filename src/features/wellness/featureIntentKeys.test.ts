import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import type { FeatureKey } from '@/types/database'
import { buildFeatureIntent } from './api/featureIntents'

/**
 * The `FeatureKey` union and the CHECK on `feature_intents.feature_key` MUST
 * agree in both directions.
 *
 * This is not cosmetic. `captureFeatureIntent` is fire-and-forget at most call
 * sites, so a key the database rejects fails with a `23514` nobody sees, and the
 * demand signal for a whole feature silently reads as zero. Pinning it here is
 * the only thing that catches a key added to the TypeScript union but not to the
 * migration.
 *
 * This reads the migration FILE, which is the ONLY way to check it: the table has
 * no select policy, so the live CHECK cannot be read back, and a probe insert
 * would leave an undeletable fake demand row behind. (The widening is applied —
 * see CLAUDE.md §7.)
 */

const MIGRATIONS = [
  '20260622120000_feature_intents.sql',
  '20260730150000_feature_intents_keys.sql',
] as const

function read(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../supabase/migrations/${name}`, import.meta.url)),
    'utf8',
  )
}

/** Strip `-- …` line comments, whose prose contains parentheses of its own. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '')
}

/** Keys allowed by the LATEST CHECK on feature_key. */
function allowedKeys(): string[] {
  // The last migration to (re)declare the constraint is the one in force.
  for (const name of [...MIGRATIONS].reverse()) {
    const sql = stripComments(read(name))
    const match = /feature_key in \(([^)]*)\)/s.exec(sql)
    if (match) {
      return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    }
  }
  throw new Error('no feature_key CHECK found in any migration')
}

/** Every key the client can produce. Kept in sync by the assertions below. */
const CLIENT_KEYS: FeatureKey[] = [
  'meditation',
  'supplement_tracker',
  'vision_images',
  'referral',
]

/**
 * Keys the database CHECK still permits but the client must never write again.
 *
 * AI IS CANCELLED, not deferred: no part of this product will call a paid model
 * provider, so measuring demand for one is measuring demand for something
 * nobody intends to build. The two chips are gone, and the union in
 * `database.ts` no longer contains their keys.
 *
 * The CHECK is deliberately NOT narrowed to match. Dropping a value from a CHECK
 * is a migration, and the cloud database is fully applied with nothing pending;
 * a permissive constraint costs nothing, while an unapplied migration would
 * leave the app writing keys the database rejects. Any rows already recorded
 * stay exactly where they are: they are real signal about what people wanted,
 * and deleting them would be rewriting history to match a later decision.
 */
const RETIRED_KEYS = [
  'ai_coach',
  'voice_journal',
  /*
   * RETIRED BECAUSE IT SHIPPED, which is the happy version of this list and
   * worth distinguishing from the two above. Sleep sounds is live: the white,
   * pink and brown tracks are generated on the device, so there was never a
   * file to license. Measuring demand for a feature somebody can already use is
   * the dishonesty concepts.ts exists to avoid.
   */
  'sleep_sounds',
]

describe('feature_intents keys', () => {
  const allowed = allowedKeys()

  it('the database allows every key the client can write', () => {
    for (const key of CLIENT_KEYS) {
      expect(allowed, `the CHECK must allow '${key}'`).toContain(key)
    }
  })

  it('every key the database allows is either live or explicitly retired', () => {
    // A key allowed by the DB and absent from BOTH lists is dead weight that
    // will confuse the next person reading either file.
    const accounted = [...(CLIENT_KEYS as string[]), ...RETIRED_KEYS]
    for (const key of allowed) {
      expect(
        accounted,
        `'${key}' is allowed by the DB but is neither produced by the client nor listed as retired`,
      ).toContain(key)
    }
  })

  it('a retired key is never produced by the client again', () => {
    // The chips are deleted; this is what stops one coming back by copy-paste.
    for (const key of RETIRED_KEYS) {
      expect(CLIENT_KEYS as string[], `'${key}' is cancelled and must not be live`).not.toContain(key)
    }
  })

  it('KEEPS the three original keys, so the rows they already collected stay valid', () => {
    for (const key of ['meditation', 'sleep_sounds', 'supplement_tracker']) {
      expect(allowed).toContain(key)
    }
  })

  it('has no duplicates on either side', () => {
    expect(new Set(allowed).size).toBe(allowed.length)
    expect(new Set(CLIENT_KEYS).size).toBe(CLIENT_KEYS.length)
  })

  it('widens the constraint by NAME, so a second push is a no-op', () => {
    const sql = read('20260730150000_feature_intents_keys.sql')
    expect(sql).toMatch(/drop constraint if exists feature_intents_feature_key_check/)
    expect(sql).toMatch(/add constraint feature_intents_feature_key_check/)
  })

  it('changes nothing else about the insert-only table', () => {
    const sql = read('20260730150000_feature_intents_keys.sql')
    // Still no read path, still no new grants — it is a CHECK swap and nothing more.
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).not.toMatch(/drop policy/i)
    expect(sql).not.toMatch(/\bgrant\b/i)
    expect(sql).not.toMatch(/for select/i)
  })

  it('builds a row the CHECK would accept for every client key', () => {
    for (const key of CLIENT_KEYS) {
      const row = buildFeatureIntent({ featureKey: key, userId: null, source: 'test' })
      expect(row.feature_key).toBe(key)
      expect(allowed).toContain(row.feature_key)
    }
  })
})
