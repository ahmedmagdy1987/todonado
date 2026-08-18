import { describe, expect, it } from 'vitest'
import { ENTITLEMENTS, type LimitKey } from './entitlements'
import { LIMIT_LABELS, UPGRADE_COPY } from './upgradeCopy'
import { driftDiagnostics, freeLimitMessage, resolveFreeLimitOutcome } from './freeLimitRecovery'

const CAPPED: LimitKey[] = ['mindMaps', 'quitHabits', 'personalTemplates', 'visionCards']

/** The wire error the server really sends, built for a given feature. */
const wireError = (feature: string, cap: number) => ({
  code: '23514',
  details: null,
  hint: feature,
  message: `free_limit_reached:${feature}:${cap}`,
})

const FREE = { status: 'resolved', plan: 'free' } as const
const PRO = { status: 'resolved', plan: 'pro' } as const
const LOADING = { status: 'resolving', plan: 'free' } as const

describe('a Free account that hits a ceiling', () => {
  it.each(CAPPED)('explains %s specifically rather than generically', (feature) => {
    const cap = ENTITLEMENTS.free.limits[feature]
    const outcome = resolveFreeLimitOutcome(wireError(feature, cap), FREE)

    expect(outcome?.kind).toBe('upgrade')
    if (outcome?.kind !== 'upgrade') return

    expect(outcome.feature).toBe(feature)
    // Names the thing that ran out, in the product's own words.
    expect(outcome.message).toContain(LIMIT_LABELS[feature].items)
    // States the ceiling.
    expect(outcome.message).toContain(String(cap))
  })

  it.each(CAPPED)('promises %s existing content is safe', (feature) => {
    const cap = ENTITLEMENTS.free.limits[feature]
    const outcome = resolveFreeLimitOutcome(wireError(feature, cap), FREE)
    const reassurance = UPGRADE_COPY[feature].reassurance

    // Every capped feature must HAVE the sentence, and the message must carry it.
    expect(reassurance, `${feature} has no reassurance copy`).toBeTruthy()
    expect(outcome?.kind === 'upgrade' && outcome.message).toContain(reassurance!)
  })

  it.each(CAPPED)('tells the user Pro lifts the %s limit', (feature) => {
    const outcome = resolveFreeLimitOutcome(
      wireError(feature, ENTITLEMENTS.free.limits[feature]),
      FREE,
    )
    expect(outcome?.kind === 'upgrade' && outcome.message).toContain('Pro removes this limit')
  })

  /*
   * §5 of the brief, and the actual behaviour of the trigger: the cap gates
   * INSERT only and touches no existing row. Telling someone to delete
   * something would be describing a product we do not ship.
   */
  /*
   * Phrases, not words. "Pro removes this limit" and "this only limits creating
   * new ones" are both correct and both contain words a blunter check would
   * ban — so the check has to name the thing actually forbidden: asking the user
   * to get rid of their own content, or implying any of it is at risk.
   */
  it.each(CAPPED)('never tells the user to delete anything (%s)', (feature) => {
    const outcome = resolveFreeLimitOutcome(
      wireError(feature, ENTITLEMENTS.free.limits[feature]),
      FREE,
    )
    const message = ((outcome?.kind === 'upgrade' && outcome.message) || '').toLowerCase()
    for (const forbidden of [
      'delete',
      'make room',
      'free up',
      'will be lost',
      'you must remove',
      'remove one',
      'or upgrade',
    ]) {
      expect(message, `${feature}: "${forbidden}"`).not.toContain(forbidden)
    }
  })

  it('uses no urgency or scarcity language', () => {
    for (const feature of CAPPED) {
      const message = freeLimitMessage(feature, ENTITLEMENTS.free.limits[feature]).toLowerCase()
      for (const forbidden of [
        'hurry',
        'limited time',
        'expires',
        'act fast',
        "don't miss",
        'last chance',
        'upgrade now',
        '!',
      ]) {
        expect(message, `${feature}: "${forbidden}"`).not.toContain(forbidden)
      }
    }
  })
})

describe('the cap shown comes from the entitlement contract', () => {
  /*
   * §6: the numbers are owned by ENTITLEMENTS, not duplicated at the call site
   * and not taken off the wire. `sqlLimitContract.test.ts` separately holds the
   * SQL caps equal to these, so all three agree by test rather than by hope.
   */
  it.each(CAPPED)('renders %s from ENTITLEMENTS, not the number the server sent', (feature) => {
    const declared = ENTITLEMENTS.free.limits[feature]
    // Deliberately disagree with the contract to prove which side is rendered.
    const outcome = resolveFreeLimitOutcome(wireError(feature, declared + 99), FREE)

    expect(outcome?.kind === 'upgrade' && outcome.cap).toBe(declared)
    expect(outcome?.kind === 'upgrade' && outcome.message).toContain(String(declared))
    expect(outcome?.kind === 'upgrade' && outcome.message).not.toContain(String(declared + 99))
  })

  it('has a label for every limit key, so a new cap cannot ship nameless', () => {
    for (const key of Object.keys(ENTITLEMENTS.free.limits) as LimitKey[]) {
      expect(LIMIT_LABELS[key]?.name, `${key} has no label`).toBeTruthy()
      expect(LIMIT_LABELS[key]?.items, `${key} has no item noun`).toBeTruthy()
    }
  })
})

describe('a Pro account must never be sold what it already has', () => {
  it.each(CAPPED)('reports %s as entitlement drift, not an upgrade', (feature) => {
    const outcome = resolveFreeLimitOutcome(
      wireError(feature, ENTITLEMENTS.free.limits[feature]),
      PRO,
    )
    expect(outcome?.kind).toBe('inconsistent')
    // There is no message to render at all, so no surface can show a sales line.
    expect(outcome).not.toHaveProperty('message')
  })

  it('captures diagnostics a developer can act on', () => {
    const outcome = resolveFreeLimitOutcome(wireError('mindMaps', 3), PRO)
    if (outcome?.kind !== 'inconsistent') throw new Error('expected drift')

    const { message, detail } = driftDiagnostics(outcome)
    expect(message).toMatch(/entitlement/i)
    expect(detail).toMatchObject({ feature: 'mindMaps', serverCap: 3, clientPlan: 'pro' })
    // The client's own ceiling for a Pro plan is unlimited — the contradiction.
    expect(detail.clientCap).toBe(ENTITLEMENTS.pro.limits.mindMaps)
    expect(String(detail.hint)).toMatch(/effective_plan/)
  })
})

describe('an unresolved plan produces no prompt at all', () => {
  /*
   * §9. The click on an upgrade CTA is not free: `ProUpgradeNotice` records an
   * `upgrade_intents` row and that table has no delete policy. Raising the
   * prompt on a plan we have not resolved would manufacture demand that cannot
   * be withdrawn, so the ordinary error runs instead.
   */
  it.each(CAPPED)('falls back to the normal error path for %s', (feature) => {
    const outcome = resolveFreeLimitOutcome(
      wireError(feature, ENTITLEMENTS.free.limits[feature]),
      LOADING,
    )
    expect(outcome).toEqual({ kind: 'unresolved', feature })
  })
})

describe('non-entitlement failures are left alone', () => {
  it.each([
    ['a dropped connection', new TypeError('Failed to fetch')],
    ['a permission error', { code: '42501', message: 'permission denied for table mind_maps' }],
    ['a size CHECK on the same table', { code: '23514', message: 'new row violates check constraint "mind_maps_title_len"' }],
  ])('returns null for %s, on every plan state', (_label, error) => {
    for (const entitlement of [FREE, PRO, LOADING]) {
      expect(resolveFreeLimitOutcome(error, entitlement)).toBeNull()
    }
  })
})
