import { describe, expect, it } from 'vitest'
import { shouldOfferRetry } from './queryClient'

/**
 * The global mutation-error toast offers a one-click Retry. Retry re-runs the
 * mutation, so it must be suppressed for non-idempotent inserts (which set
 * `meta.noRetry`) — otherwise a commit-then-lost-response + Retry duplicates a row.
 * (Audit follow-up: createTask/addSubtask/createProject/createSection/createItem/
 * markTaken now all carry noRetry, mirroring startSession.)
 */
describe('shouldOfferRetry — global error-toast Retry gating', () => {
  it('offers Retry for a replayable mutation with no opt-out', () => {
    expect(shouldOfferRetry(undefined, { id: '1' })).toBe(true)
    expect(shouldOfferRetry({}, 'x')).toBe(true)
    expect(shouldOfferRetry({ noRetry: false }, { id: '1' })).toBe(true)
  })

  it('suppresses Retry for non-idempotent inserts (meta.noRetry)', () => {
    expect(shouldOfferRetry({ noRetry: true }, { title: 'new task' })).toBe(false)
  })

  it('suppresses Retry when there are no variables to replay', () => {
    expect(shouldOfferRetry(undefined, undefined)).toBe(false)
    expect(shouldOfferRetry({ noRetry: false }, undefined)).toBe(false)
  })
})
