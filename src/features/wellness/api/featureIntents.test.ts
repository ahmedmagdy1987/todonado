import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildFeatureIntent, recordFeatureIntent } from './featureIntents'

/**
 * Minimal fake of the slice recordFeatureIntent uses: from(table).insert(row),
 * awaited directly (no .select()). Mirrors the injected-client pattern in
 * upgradeIntents.test.ts so we can assert the insert payload without a real DB.
 */
function makeClient(opts: { error?: { message: string } } = {}) {
  const calls: { table: string; row: unknown; selected: boolean }[] = []
  const client = {
    from(table: string) {
      return {
        insert(row: unknown) {
          const call = { table, row, selected: false }
          calls.push(call)
          const result = Promise.resolve({ data: null, error: opts.error ?? null })
          // Expose a .select() so an accidental read-back would be observable.
          return Object.assign(result, {
            select() {
              call.selected = true
              return Promise.resolve({ data: null, error: opts.error ?? null })
            },
          })
        },
      }
    },
  }
  return { client: client as unknown as Pick<SupabaseClient, 'from'>, calls }
}

describe('buildFeatureIntent', () => {
  it('maps featureKey to feature_key and defaults user_id/source to null', () => {
    expect(buildFeatureIntent({ featureKey: 'meditation' })).toEqual({
      feature_key: 'meditation',
      user_id: null,
      source: null,
    })
  })

  it('keeps user_id and source when provided', () => {
    expect(
      buildFeatureIntent({ featureKey: 'sleep_sounds', userId: 'u1', source: 'landing' }),
    ).toEqual({ feature_key: 'sleep_sounds', user_id: 'u1', source: 'landing' })
  })
})

describe('recordFeatureIntent', () => {
  // The headline regression: one interest click => exactly one row, right feature_key.
  it('inserts exactly one feature_intents row with the right feature_key (and no read-back)', async () => {
    const { client, calls } = makeClient()
    await recordFeatureIntent(client, {
      featureKey: 'supplement_tracker',
      userId: 'u1',
      source: 'wellness',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('feature_intents')
    expect(calls[0].row).toEqual({
      feature_key: 'supplement_tracker',
      user_id: 'u1',
      source: 'wellness',
    })
    expect(calls[0].selected).toBe(false) // write-only: must not .select() back (RLS)
  })

  it('files an anonymous intent (user_id null) for a logged-out landing visitor', async () => {
    const { client, calls } = makeClient()
    await recordFeatureIntent(client, { featureKey: 'meditation', source: 'landing' })
    expect(calls).toHaveLength(1)
    expect(calls[0].row).toEqual({ feature_key: 'meditation', user_id: null, source: 'landing' })
  })

  it('throws when the insert errors (e.g. RLS denial)', async () => {
    const { client } = makeClient({ error: { message: 'rls denied' } })
    await expect(
      recordFeatureIntent(client, { featureKey: 'meditation' }),
    ).rejects.toEqual({ message: 'rls denied' })
  })
})
