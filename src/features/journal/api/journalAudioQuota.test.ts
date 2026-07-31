import { describe, expect, it } from 'vitest'
import {
  JOURNAL_AUDIO_QUOTA_BYTES,
  exceedsQuota,
  journalAudioUsageIn,
  quotaMessage,
  type AudioStore,
} from './useJournal'

/**
 * ONE ACCOUNT MAY NOT FILL THE STORAGE BILL.
 *
 * The bucket caps a single object at 10 MB and restricts its MIME type, both
 * server-side. Neither says anything about HOW MANY objects one account may
 * have, and signup is free and autoconfirmed — so an account could loop uploads
 * into its own folder indefinitely. Every one of those writes is RLS-legal and
 * owner-scoped, which is precisely why the database does not refuse them: the
 * policy is about whose folder, not how big.
 *
 * The interesting case is not "does 300 MB fail". It is the PAGING: usage has
 * to advance the offset (nothing is being deleted, so the page below does not
 * move up), which is the exact opposite of the delete sweep in the same module.
 * Getting that backwards in either direction silently under-counts, and an
 * under-counted quota is no quota at all.
 */

const MB = 1024 * 1024
const USER = '11111111-2222-3333-4444-555555555555'

/** A fake bucket that honours `offset` and reports per-object sizes. */
function fakeStore(sizes: number[]) {
  const objects = sizes.map((size, i) => ({
    id: `id-${i}`,
    name: `rec-${i}.webm`,
    metadata: { size },
  }))
  const calls = { list: 0 }
  const store: AudioStore = {
    async list(_prefix, { limit, offset }) {
      calls.list += 1
      return { data: objects.slice(offset, offset + limit), error: null }
    },
    async remove() {
      return { error: null }
    },
  }
  return { store, calls }
}

describe('journalAudioUsageIn', () => {
  it('adds up one page', async () => {
    const { store } = fakeStore([1 * MB, 2 * MB, 3 * MB])
    expect(await journalAudioUsageIn(store, USER, 100)).toEqual({ bytes: 6 * MB, count: 3 })
  })

  it('COUNTS EVERY PAGE — the offset advances, unlike the delete sweep', async () => {
    // 250 recordings of 1 MB at a page size of 100. A sweep that reused the
    // delete-path trick of holding offset at 0 would loop forever or stop at
    // 100; one that forgot to page at all would report 100 MB and let an
    // account at the limit keep uploading.
    const { store } = fakeStore(Array.from({ length: 250 }, () => 1 * MB))
    const usage = await journalAudioUsageIn(store, USER, 100)
    expect(usage.count, 'recordings were missed').toBe(250)
    expect(usage.bytes).toBe(250 * MB)
  })

  it('treats an object with no size metadata as zero rather than NaN', async () => {
    const store: AudioStore = {
      async list() {
        return { data: [{ id: '1', name: 'a.webm', metadata: null }], error: null }
      },
      async remove() {
        return { error: null }
      },
    }
    const usage = await journalAudioUsageIn(store, USER, 100)
    expect(Number.isFinite(usage.bytes)).toBe(true)
    expect(usage).toEqual({ bytes: 0, count: 1 })
  })

  it('ignores folder entries, which have no id', async () => {
    const store: AudioStore = {
      async list() {
        return { data: [{ id: null, name: 'folder', metadata: { size: 999 } }], error: null }
      },
      async remove() {
        return { error: null }
      },
    }
    expect(await journalAudioUsageIn(store, USER, 100)).toEqual({ bytes: 0, count: 0 })
  })

  it('throws rather than reporting a low number when storage refuses', async () => {
    const store: AudioStore = {
      async list() {
        return { data: null, error: { message: 'list blew up' } }
      },
      async remove() {
        return { error: null }
      },
    }
    // Swallowing this would report 0 bytes used and wave every upload through.
    await expect(journalAudioUsageIn(store, USER, 100)).rejects.toThrow(/list blew up/)
  })
})

describe('exceedsQuota', () => {
  const quota = 200 * MB

  it('allows an upload that fits exactly', () => {
    expect(exceedsQuota({ bytes: 190 * MB, count: 20 }, 10 * MB, quota)).toBe(false)
  })

  it('refuses the byte that goes over', () => {
    expect(exceedsQuota({ bytes: 190 * MB, count: 20 }, 10 * MB + 1, quota)).toBe(true)
  })

  it('counts the INCOMING file, not just what is already stored', () => {
    // The bug this prevents: checking `usage.bytes > quota` alone lets a user
    // sitting just under the line upload one more 10 MB object every time.
    expect(exceedsQuota({ bytes: 199 * MB, count: 40 }, 5 * MB, quota)).toBe(true)
  })

  it('fits a year of daily voice notes, which is the honest claim', () => {
    /*
     * A two-minute Opus note is roughly half a megabyte, and the journal is one
     * entry per day. 200 MB is therefore about 400 recordings.
     *
     * The first version of this test claimed TWO years and asserted it passed.
     * It failed, because 730 × 0.5 MB is 365 MB. The number was right and the
     * sentence around it was wrong, which is the more dangerous of the two: a
     * comment nobody re-derives becomes the thing people plan against. One
     * year fits with room to spare; two does not, and the message says what to
     * do when you get there.
     */
    const oneYear = { bytes: 365 * 0.5 * MB, count: 365 }
    expect(exceedsQuota(oneYear, 0.5 * MB)).toBe(false)

    const twoYears = { bytes: 730 * 0.5 * MB, count: 730 }
    expect(exceedsQuota(twoYears, 0.5 * MB)).toBe(true)

    expect(JOURNAL_AUDIO_QUOTA_BYTES).toBe(200 * MB)
  })
})

describe('quotaMessage', () => {
  it('names the numbers and gives two ways out', () => {
    const msg = quotaMessage({ bytes: 200 * MB, count: 40 })
    expect(msg).toContain('200 MB')
    expect(msg).toMatch(/delete an older recording/i)
    expect(msg).toMatch(/save this entry as text/i)
    // Never blames the user, and never says "error".
    expect(msg).not.toMatch(/error|failed|invalid/i)
  })
})
