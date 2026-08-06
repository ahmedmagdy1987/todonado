import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/**
 * VOICE-NOTE PLAYBACK MUST STAY INSIDE THE SHIPPED CSP.
 *
 * The deployed policy is `media-src 'self' blob:`. Playback used to assign the
 * absolute `https://<ref>.supabase.co/storage/...` signed URL to `<audio src>`,
 * which that directive does not permit, so the browser refused the media before
 * any request left it. The player rendered, the controls worked, nothing
 * played, and no test noticed — the only playback assertion checked the `src`
 * attribute rather than whether the audio loaded.
 *
 * These are source-level because the failure is a MISMATCH BETWEEN TWO FILES
 * (the CSP in vercel.json and the URL kind the hook produces) that no single
 * unit test would ever compare. The rendered behaviour is covered where a real
 * engine exists: e2e/journal-audio.spec.ts now asserts readyState/error.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const vercelJson = JSON.parse(read('../../../vercel.json'))
const csp: string = vercelJson.headers
  .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
  .find((h: { key: string }) => h.key === 'Content-Security-Policy').value

const directive = (name: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `) || d === name) ?? ''

const hookSource = read('./api/useJournal.ts')

describe('the CSP and the playback URL agree', () => {
  it('media-src allows blob:, which is what playback produces', () => {
    expect(directive('media-src')).toContain('blob:')
  })

  it('the hook produces a blob: URL, not a remote Storage URL', () => {
    /*
     * `download()` is a connect-src fetch (allowed), and the object URL it
     * yields is covered by `media-src blob:`. `createSignedUrl` returns an
     * absolute supabase.co URL, which media-src does NOT cover.
     */
    expect(hookSource).toMatch(/\.download\(/)
    expect(hookSource).toMatch(/URL\.createObjectURL/)
    const audioHook = hookSource.slice(hookSource.indexOf('export function useAudioUrl'))
    expect(
      audioHook,
      'useAudioUrl must not hand a signed remote URL to <audio src> — media-src forbids that origin',
    ).not.toMatch(/createSignedUrl/)
  })

  it('revokes the object URL, so playback does not leak one blob per clip', () => {
    expect(hookSource).toMatch(/revokeObjectURL/)
  })

  it('media-src does NOT name the Supabase origin, so the tight policy is kept', () => {
    /*
     * Deliberate: the bug could also have been "fixed" by adding the Storage
     * origin to media-src. That widens the policy for a bucket that is private
     * precisely so its origin never has to be broadly reachable. If someone
     * later adds it, this test asks them to justify it.
     */
    expect(directive('media-src')).not.toContain('supabase.co')
  })
})
