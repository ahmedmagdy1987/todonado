import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, MAX_ENTRY_CHARS } from './journal'
import { AUDIO_BUCKET } from './api/useJournal'

/**
 * A journal is the most sensitive thing in this app, and its security lives in
 * two places a reader of the client code will never see: the storage bucket's
 * privacy flag, and the per-user path policy on `storage.objects`.
 *
 * Both are one dashboard click from being wrong, and nothing in the TypeScript
 * would fail if they were. So this file pins them, alongside the usual
 * client-caps-match-the-CHECKs job.
 */

const sql = readFileSync(
  fileURLToPath(
    new URL('../../../supabase/migrations/20260731140000_journal_entries.sql', import.meta.url),
  ),
  'utf8',
)

function sqlNumber(pattern: RegExp): number {
  const match = pattern.exec(sql)
  expect(match, `migration is missing: ${pattern}`).not.toBeNull()
  return Number(match![1])
}

describe('client caps match the database', () => {
  it('entry-length cap agrees', () => {
    expect(sqlNumber(/char_length\(text\)\s*<=\s*(\d+)/)).toBe(MAX_ENTRY_CHARS)
  })

  it('audio-duration cap agrees with the recorder', () => {
    // If the DB were the tighter of the two, a user would record for the full
    // five minutes and only discover on save that it was refused.
    expect(sqlNumber(/audio_seconds\s*<=\s*(\d+)/)).toBe(MAX_AUDIO_SECONDS)
  })

  it('bucket size limit agrees with the client', () => {
    expect(sqlNumber(/file_size_limit[\s\S]{0,80}?(\d{6,})/)).toBe(MAX_AUDIO_BYTES)
  })

  it('keeps a path and a duration travelling together', () => {
    // One without the other is a player that cannot play, or a duration for
    // nothing — both would render as a broken control.
    expect(sql).toMatch(/\(audio_path is null\) = \(audio_seconds is null\)/)
  })

  it('enforces one entry per local day', () => {
    expect(sql).toMatch(/unique \(user_id, entry_date\)/)
    expect(sql).toMatch(/entry_date\s+date not null/)
  })
})

describe('the table is owner-only', () => {
  it('keeps the policy set intact', () => {
    for (const action of ['select', 'insert', 'update', 'delete']) {
      expect(sql, `missing ${action} policy`).toContain(`journal_entries_${action}_own`)
    }
    expect(sql).toContain('user_id = auth.uid()')
  })
})

describe('the audio bucket is private, and stays private', () => {
  it('creates the bucket the client actually writes to', () => {
    expect(sql).toContain(`'${AUDIO_BUCKET}'`)
  })

  it('is created NOT public', () => {
    // A public bucket would make every recording readable by anyone who guessed
    // a URL. This is the single most important line in the file.
    expect(sql).toMatch(/values \(\s*'journal-audio',\s*'journal-audio',\s*false/)
  })

  it('RE-ASSERTS privacy on conflict, so re-running repairs a bucket made public', () => {
    const onConflict = /on conflict \(id\) do update[\s\S]*?;/.exec(sql)?.[0] ?? ''
    expect(onConflict, 'the upsert must not merely do nothing').toContain('set public = false')
  })

  it('restricts uploads to audio types', () => {
    expect(sql).toContain('allowed_mime_types')
    expect(sql).toContain("'audio/webm'")
  })

  it('scopes EVERY object policy to the caller’s own folder', () => {
    const policies = ['select', 'insert', 'update', 'delete'].map(
      (a) => new RegExp(`create policy journal_audio_${a}_own[\\s\\S]*?;`).exec(sql)?.[0] ?? '',
    )
    for (const [i, policy] of policies.entries()) {
      expect(policy, `journal_audio policy ${i} is missing`).toBeTruthy()
      expect(policy).toContain("bucket_id = 'journal-audio'")
      // The first path segment IS the authorisation — `audioKey` builds keys to
      // match, and a key built any other way is refused by the database.
      expect(policy).toContain("(storage.foldername(name))[1] = auth.uid()::text")
      expect(policy).toContain('to authenticated')
    }
  })

  it('grants nothing to anon, anywhere in the file', () => {
    expect(sql).not.toMatch(/to\s+anon/i)
  })
})
