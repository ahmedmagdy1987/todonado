import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { audioKey } from './journal'

/**
 * THE OBJECT KEY IS WRITTEN IN TWO PLACES, AND MUST NEVER DIVERGE.
 *
 * ── WHY IT IS DUPLICATED AT ALL ────────────────────────────────────────────
 *
 * `audioKey` lives here, in `journal.ts`, which imports `@/types/database` and
 * the history window and is therefore NOT a leaf module. `api/**` may only
 * import dependency-free modules (see tsconfig.api.json), so the planned
 * server-authorised upload endpoint cannot import it and writes the shape out
 * again.
 *
 * THAT ENDPOINT IS NOT SHIPPED. It is parked, whole and tested, in
 * docs/followups/voice-note-hardening/, because the upload hardening can only
 * deploy atomically with a client rewire and a storage-policy change that could
 * not be validated without a Supabase Storage API. This test still compares the
 * two shapes, so the parked design cannot drift away from the live key while it
 * waits.
 *
 * ── WHY DRIFT WOULD BE SILENT AND EXPENSIVE ────────────────────────────────
 *
 * The key shape IS the authorisation. The storage policy requires the first
 * path segment to equal `auth.uid()`, and playback looks the object up by the
 * path stored on the journal row. If the server started minting a different
 * shape, nothing would throw: uploads would land somewhere the policy happened
 * to still allow, or playback would quietly fail to find a recording that
 * exists. This test is what makes that a red build instead.
 */

const SERVER = readFileSync(
  fileURLToPath(new URL('../../../docs/followups/voice-note-hardening/journal-audio-upload-url.ts.txt', import.meta.url)),
  'utf8',
)

describe('the journal audio key', () => {
  it('is `<user_id>/<entryDate>-<unique>.webm`', () => {
    expect(audioKey('u-1', '2026-08-18', 'abcd1234')).toBe('u-1/2026-08-18-abcd1234.webm')
  })

  it('starts with the OWNER, because the storage policy authorises on that segment', () => {
    // `(storage.foldername(name))[1] = auth.uid()::text` — verified against the
    // live policy. A key that did not start with the owner would be refused by
    // the database, which is the behaviour we want to keep depending on.
    expect(audioKey('owner', '2026-01-01', 'x').split('/')[0]).toBe('owner')
  })

  it('is produced identically by the server endpoint', () => {
    const match = /return `([^`]+)`/.exec(
      SERVER.slice(SERVER.indexOf('function serverAudioKey')),
    )
    expect(match, 'serverAudioKey no longer returns a template literal').not.toBeNull()

    // The server writes `${userId}/${entryDate}-${unique}.webm`; evaluate it with
    // the same names so the comparison is of SHAPE, not of source text.
    const userId = 'u-1'
    const entryDate = '2026-08-18'
    const unique = 'abcd1234'
    const rendered = match![1]
      .replace('${userId}', userId)
      .replace('${entryDate}', entryDate)
      .replace('${unique}', unique)

    expect(rendered).toBe(audioKey(userId, entryDate, unique))
  })
})
