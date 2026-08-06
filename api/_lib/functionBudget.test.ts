import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/**
 * EVERY TOP-LEVEL api/*.ts IS A VERCEL SERVERLESS FUNCTION — INCLUDING TESTS.
 *
 * Vercel's Node builder treats each file directly under `api/` as a function
 * entry point. It does not care that a file is named `*.test.ts`. The Hobby
 * plan allows 12 functions per deployment, and this project sits at EXACTLY 12.
 *
 * That is not theoretical. Adding one ordinary unit test at `api/` level took
 * the count to 13 and the Vercel deployment FAILED, while every GitHub Actions
 * job stayed green — the local build, the typecheck, the DOM-lib parity check
 * and 1622 unit tests all passed. The only signal was a red Vercel check with
 * logs that need the Vercel CLI to read.
 *
 * So the budget is asserted here, where it fails in the same suite everything
 * else does. `api/_lib/` is underscore-prefixed and excluded by Vercel, which
 * is why this file and its neighbours cost nothing.
 *
 * IF THIS TEST FAILS, DO NOT RAISE THE NUMBER. Move the new file into
 * `api/_lib/` (helpers and their tests) or add it under `src/`. Raise the limit
 * only alongside a plan change, and say so here.
 */

const API_DIR = fileURLToPath(new URL('..', import.meta.url))

/** Hobby plan ceiling. */
const VERCEL_FUNCTION_LIMIT = 12

function topLevelFunctionFiles(): string[] {
  return readdirSync(API_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.ts$/.test(e.name))
    .map((e) => e.name)
    .sort()
}

describe('the Vercel serverless-function budget', () => {
  it(`stays within ${VERCEL_FUNCTION_LIMIT} top-level api/*.ts files`, () => {
    const files = topLevelFunctionFiles()
    expect(
      files.length,
      `Vercel counts each of these as a function (tests included):\n  ${files.join('\n  ')}\n\n` +
        'Move helpers and their tests into api/_lib/, which Vercel excludes.',
    ).toBeLessThanOrEqual(VERCEL_FUNCTION_LIMIT)
  })

  it('still contains the four real endpoints', () => {
    // The budget must never be met by deleting a real endpoint.
    const files = topLevelFunctionFiles()
    for (const endpoint of [
      'create-checkout-session.ts',
      'create-portal-session.ts',
      'stripe-webhook.ts',
      'calendar-fetch.ts',
    ]) {
      expect(files, `${endpoint} must remain an api/ entry point`).toContain(endpoint)
    }
  })
})
