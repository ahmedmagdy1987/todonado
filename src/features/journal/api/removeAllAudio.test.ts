import { describe, expect, it } from 'vitest'
import { removeAllAudioIn, type AudioStore } from './useJournal'

/**
 * Deleting an account has to take the recordings with it.
 *
 * The FK graph does not reach storage — `delete_own_account()` removes the
 * `journal_entries` row that NAMES a recording while the recording itself stays
 * in the bucket. So this sweep runs first, and it is the only thing standing
 * between "your account is deleted" and the most sensitive audio this app holds
 * sitting on a server belonging to nobody.
 *
 * The failure worth testing is not "does it delete a file" — it is what happens
 * on the SECOND page. `list` is capped, and the obvious loop (advance the
 * offset each round) steps over exactly as many objects as it just deleted,
 * silently leaving the oldest recordings behind. That is the bug this file
 * exists to catch, so the fake store below really does shrink as it is emptied.
 */

/** A fake bucket that behaves like storage: `list` reflects earlier removals. */
function fakeStore(names: string[], opts: { failOnRemove?: boolean; failOnList?: boolean } = {}) {
  let objects = names.map((name) => ({ id: `id-${name}`, name }))
  const calls: { list: number; remove: number } = { list: 0, remove: 0 }

  const store: AudioStore = {
    async list(_prefix, { limit, offset }) {
      calls.list += 1
      if (opts.failOnList) return { data: null, error: { message: 'list blew up' } }
      // HONOURS `offset`, because real storage does. A fake that ignored it
      // would make the paging bug below invisible — and the first version of
      // this file did exactly that, so the negative control passed and proved
      // nothing.
      return { data: objects.slice(offset, offset + limit), error: null }
    },
    async remove(paths) {
      calls.remove += 1
      if (opts.failOnRemove) return { error: { message: 'remove blew up' } }
      const gone = new Set(paths.map((p) => p.split('/').slice(1).join('/')))
      objects = objects.filter((o) => !gone.has(o.name))
      return { error: null }
    },
  }

  return { store, calls, remaining: () => objects.map((o) => o.name) }
}

const USER = '11111111-2222-3333-4444-555555555555'

describe('removeAllAudioIn', () => {
  it('removes a single page and reports the count', async () => {
    const f = fakeStore(['a.webm', 'b.webm'])
    expect(await removeAllAudioIn(f.store, USER, 100)).toBe(2)
    expect(f.remaining()).toEqual([])
  })

  it('EMPTIES THE BUCKET ACROSS PAGES — the oldest recordings are not left behind', async () => {
    // 250 recordings at a page size of 100: a year of daily journalling.
    const names = Array.from({ length: 250 }, (_, i) => `rec-${String(i).padStart(3, '0')}.webm`)
    const f = fakeStore(names)

    expect(await removeAllAudioIn(f.store, USER, 100)).toBe(250)
    expect(f.remaining(), 'recordings survived the sweep').toEqual([])
    // 100 + 100 + 50 → the third page is short, which is how it knows to stop.
    expect(f.calls.remove).toBe(3)
  })

  it('stops as soon as a page comes back empty', async () => {
    const f = fakeStore([])
    expect(await removeAllAudioIn(f.store, USER, 100)).toBe(0)
    expect(f.calls.remove, 'asked storage to remove nothing').toBe(0)
  })

  it('keys every path under the user folder, which IS the authorisation', async () => {
    // The bucket policy checks `(storage.foldername(name))[1] = auth.uid()`,
    // so a path built any other way is refused by the database.
    const seen: string[][] = []
    const store: AudioStore = {
      async list(_p, { limit }) {
        return {
          data: seen.length ? [] : [{ id: '1', name: 'x.webm' }].slice(0, limit),
          error: null,
        }
      },
      async remove(paths) {
        seen.push(paths)
        return { error: null }
      },
    }
    await removeAllAudioIn(store, USER, 100)
    expect(seen).toEqual([[`${USER}/x.webm`]])
  })

  it('ignores folder entries, which have no id and cannot be removed', async () => {
    const store: AudioStore = {
      async list() {
        return { data: [{ id: null, name: 'a-folder' }], error: null }
      },
      async remove() {
        throw new Error('must not try to remove a folder')
      },
    }
    expect(await removeAllAudioIn(store, USER, 100)).toBe(0)
  })

  it('THROWS rather than reporting success when storage refuses', async () => {
    // The caller aborts the account deletion on a throw. Swallowing the error
    // here would delete the account and keep the recordings — the exact
    // outcome the whole sweep exists to prevent.
    const listFails = fakeStore(['a.webm'], { failOnList: true })
    await expect(removeAllAudioIn(listFails.store, USER, 100)).rejects.toThrow(/list blew up/)

    const removeFails = fakeStore(['a.webm'], { failOnRemove: true })
    await expect(removeAllAudioIn(removeFails.store, USER, 100)).rejects.toThrow(/remove blew up/)
    expect(removeFails.remaining(), 'nothing should have been removed').toEqual(['a.webm'])
  })
})
