import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * THE ORPHANED-OBJECT FAILURE MODE, AND THE ONE LINE THAT HANDLES IT.
 *
 * ── THE FAILURE ───────────────────────────────────────────────────────────
 *
 * A voice note is stored in two steps that cannot be one transaction:
 *
 *     1. the object goes to Storage
 *     2. the row goes to Postgres, pointing at it
 *
 * If step 2 fails, the object is already there and nothing references it. It is
 * invisible to the user, undeletable through the UI, and still on the bill.
 *
 * ── WHY THE ORDER IS NOT SIMPLY REVERSED ──────────────────────────────────
 *
 * Writing the row first would point it at an object that may never arrive, so a
 * reload would show a recording that cannot be played. Of the two, a file
 * nobody can see is strictly better than a broken player, so the upload leads
 * and the failure is COMPENSATED rather than prevented.
 *
 * ── THE STRATEGY: A COMPENSATING DELETE, AND NOTHING MORE ─────────────────
 *
 * `save()` deletes the object it just uploaded if the row write throws. That is
 * the whole mechanism: no queue, no reconciliation job, no tombstone table. A
 * background sweeper would be more machinery than the problem deserves, and
 * would itself need to distinguish an orphan from an upload in flight.
 *
 * Two backstops mean an orphan cannot accumulate indefinitely even if the
 * compensating delete ALSO fails: the object is unreachable (no row names it,
 * and the bucket is private), and `removeAllJournalAudio` purges the whole
 * folder on account deletion.
 *
 * ── WHAT THIS TEST IS ─────────────────────────────────────────────────────
 *
 * A source-level guard, and it is honest about being one. It cannot prove the
 * delete succeeds; it proves the cleanup is still WIRED, because the failure it
 * protects against is invisible in every other way. A refactor that reorders
 * the try/catch and drops this line would break nothing a user or a test could
 * see, which is exactly why it is pinned.
 */

const SAVE = readFileSync(
  fileURLToPath(new URL('./JournalPage.tsx', import.meta.url)),
  'utf8',
)

/** The body of `save()`, so the assertions cannot pass on some other function. */
function saveBody(): string {
  const start = SAVE.indexOf('async function save()')
  expect(start, 'save() not found in JournalPage').toBeGreaterThan(-1)
  const next = SAVE.indexOf('async function removeSavedAudio', start)
  return SAVE.slice(start, next > start ? next : undefined)
}

describe('a failed save never leaves an orphaned recording', () => {
  const body = saveBody()

  it('uploads BEFORE writing the row, which is what creates the risk', () => {
    const upload = body.indexOf('uploadJournalAudio')
    const row = body.indexOf('saveEntry.mutateAsync')
    expect(upload).toBeGreaterThan(-1)
    expect(row).toBeGreaterThan(-1)
    expect(upload, 'the upload must precede the row write').toBeLessThan(row)
  })

  it('removes the object it just uploaded when the row write throws', () => {
    const catchAt = body.indexOf('} catch')
    expect(catchAt, 'save() has no catch block').toBeGreaterThan(-1)
    const handler = body.slice(catchAt)
    expect(handler).toMatch(/if \(newPath\)\s*await removeJournalAudio\(newPath\)/)
  })

  it('never lets the cleanup itself throw and mask the real error', () => {
    // The user needs to see why their entry did not save, not a secondary
    // storage error from the tidy-up.
    const handler = body.slice(body.indexOf('} catch'))
    expect(handler).toMatch(/removeJournalAudio\(newPath\)\.catch\(\(\) => \{\}\)/)
  })

  it('only deletes an object THIS save created', () => {
    /*
     * `newPath` is assigned solely by the upload branch, so the cleanup can
     * never remove a previously saved recording. Deleting the old object is a
     * separate step that runs only AFTER the row already points at the new one.
     */
    expect(body).toMatch(/let newPath: string \| null = null/)
    const cleanup = body.slice(body.indexOf('} catch'))
    expect(cleanup).not.toMatch(/previousPath/)
  })
})
