import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildUpgradeIntent, isValidEmail, recordUpgradeIntent } from './upgradeIntents'

/**
 * Minimal fake of the slice recordUpgradeIntent uses: from(table).insert(row),
 * awaited directly (no .select()). Mirrors the injected-client pattern used by
 * completeTask.test.ts so we can assert the insert payload without a real DB.
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

describe('buildUpgradeIntent', () => {
  it('normalizes email (trim + lowercase) and defaults nulls', () => {
    expect(buildUpgradeIntent({ tier: 'pro', email: '  Me@Example.COM ' })).toEqual({
      tier: 'pro',
      user_id: null,
      email: 'me@example.com',
      source: null,
    })
  })

  it('keeps user_id and source; a blank email becomes null', () => {
    expect(
      buildUpgradeIntent({ tier: 'team', userId: 'u1', email: '   ', source: 'pricing' }),
    ).toEqual({ tier: 'team', user_id: 'u1', email: null, source: 'pricing' })
  })
})

describe('isValidEmail', () => {
  it('accepts a plausible address and rejects junk', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('nope')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })
})

describe('recordUpgradeIntent', () => {
  it('inserts the normalized row into upgrade_intents and does not read it back', async () => {
    const { client, calls } = makeClient()
    await recordUpgradeIntent(client, {
      tier: 'pro',
      userId: 'u1',
      email: 'X@Y.com',
      source: 'pricing',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('upgrade_intents')
    expect(calls[0].row).toEqual({
      tier: 'pro',
      user_id: 'u1',
      email: 'x@y.com',
      source: 'pricing',
    })
    expect(calls[0].selected).toBe(false) // write-only: must not .select() back (RLS)
  })

  it('throws when the insert errors (e.g. RLS denial)', async () => {
    const { client } = makeClient({ error: { message: 'rls denied' } })
    await expect(recordUpgradeIntent(client, { tier: 'pro' })).rejects.toEqual({
      message: 'rls denied',
    })
  })
})
