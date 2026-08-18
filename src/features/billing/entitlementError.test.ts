import { describe, expect, it } from 'vitest'
import { FREE_LIMIT_ERROR_PREFIX, parseEntitlementError } from './entitlementError'
import { ENTITLEMENTS, type LimitKey } from './entitlements'

/**
 * ── THE WIRE FORMAT IN THIS FILE IS OBSERVED, NOT ASSUMED ──────────────────
 *
 * The shape asserted below was captured from a real stack rather than reasoned
 * about: PostgreSQL 17.6 with the full 38-migration chain applied from empty,
 * served by PostgREST 12.2.3, called through `@supabase/postgrest-js` — the same
 * library the app ships. A Free account holding three mind maps was asked for a
 * fourth and the client received, verbatim:
 *
 *   HTTP 400
 *   {"code":"23514","details":null,"hint":"mindMaps",
 *    "message":"free_limit_reached:mindMaps:3"}
 *
 * Two details of that are load-bearing and neither is guessable:
 *
 * 1. THE FEATURE IS THE ENTITLEMENT KEY, NOT THE TABLE NAME. The trigger is
 *    passed `'mindMaps'` as its argument, so the message says `mindMaps` and
 *    never `mind_maps`. A parser written against the table name would match
 *    nothing in production while passing any test written from the same wrong
 *    assumption.
 * 2. THE ERROR IS A PLAIN OBJECT. postgrest-js does `JSON.parse(body)` on the
 *    error payload, and the value that reached the caller had constructor
 *    `Object` — not `Error`, not a `PostgrestError` instance. So the parser
 *    reads a `message` property and must never gate on `instanceof Error`.
 */

/** Exactly what the verified round trip delivered to the client. */
const OBSERVED_WIRE_ERROR = {
  code: '23514',
  details: null,
  hint: 'mindMaps',
  message: 'free_limit_reached:mindMaps:3',
}

/** The four tables the migration actually installs a trigger on. */
const CAPPED: LimitKey[] = ['mindMaps', 'quitHabits', 'personalTemplates', 'visionCards']

describe('parseEntitlementError — the observed wire format', () => {
  it('parses the exact payload captured from PostgREST + postgrest-js', () => {
    expect(parseEntitlementError(OBSERVED_WIRE_ERROR)).toEqual({
      type: 'free_limit_reached',
      feature: 'mindMaps',
      cap: 3,
    })
  })

  it.each(CAPPED)('parses every capped feature at its real Free cap (%s)', (feature) => {
    const cap = ENTITLEMENTS.free.limits[feature]
    const parsed = parseEntitlementError({
      message: `${FREE_LIMIT_ERROR_PREFIX}:${feature}:${cap}`,
      code: '23514',
    })
    expect(parsed).toEqual({ type: 'free_limit_reached', feature, cap })
  })

  it('reads the message off a plain object, not just an Error instance', () => {
    // The verified payload is a plain object; an Error must work too, since a
    // thrown DB error elsewhere in the app is a real one.
    const asError = Object.assign(new Error('free_limit_reached:visionCards:5'), {
      code: '23514',
    })
    expect(parseEntitlementError(asError)?.feature).toBe('visionCards')
  })
})

describe('parseEntitlementError — unknown stays unknown', () => {
  /*
   * Each of these must return null so the caller falls through to its ordinary
   * error handling. A false positive here is the worst outcome available: it
   * would answer a real outage with an invitation to buy something.
   */
  it('does not claim a network failure', () => {
    expect(parseEntitlementError(new TypeError('Failed to fetch'))).toBeNull()
    expect(parseEntitlementError({ message: 'NetworkError when attempting to fetch resource.' }))
      .toBeNull()
  })

  it('does not claim a permission error', () => {
    expect(
      parseEntitlementError({ code: '42501', message: 'permission denied for table mind_maps' }),
    ).toBeNull()
  })

  it('does not claim an arbitrary database message', () => {
    expect(parseEntitlementError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBeNull()
    expect(parseEntitlementError({ code: '23514', message: 'new row violates check constraint "mind_maps_title_len"' })).toBeNull()
    expect(parseEntitlementError({ code: 'PGRST205', message: "Could not find the table 'public.mind_maps'" })).toBeNull()
  })

  it('rejects a feature this build does not know', () => {
    // A fifth capped table would land here until its key joins the contract.
    expect(parseEntitlementError({ message: 'free_limit_reached:sleepSounds:3' })).toBeNull()
    // The TABLE name is not the contract; only the entitlement key is.
    expect(parseEntitlementError({ message: 'free_limit_reached:mind_maps:3' })).toBeNull()
  })

  it('rejects a malformed cap', () => {
    for (const bad of ['abc', '', '-1', '3.5', '1e3', ' 3']) {
      expect(parseEntitlementError({ message: `free_limit_reached:mindMaps:${bad}` })).toBeNull()
    }
  })

  it('is anchored, so a message that merely QUOTES the marker is not a limit', () => {
    // A wrapped/logged error carrying the text must not become an upsell.
    expect(
      parseEntitlementError({ message: 'error running statement: free_limit_reached:mindMaps:3' }),
    ).toBeNull()
    expect(parseEntitlementError({ message: 'free_limit_reached:mindMaps:3 (statement 4)' })).toBeNull()
  })

  it('survives values that are not error objects at all', () => {
    for (const junk of [null, undefined, '', 'free_limit_reached:mindMaps:3', 42, [], {}, { message: 7 }]) {
      expect(parseEntitlementError(junk)).toBeNull()
    }
  })
})
