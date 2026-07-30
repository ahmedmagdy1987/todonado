import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '@/types/database'
import {
  EMPTY_SECTIONS,
  MAX_ENTRY_CHARS,
  audioKey,
  entryForDay,
  formatDuration,
  hasContent,
  parseEntry,
  previewOf,
  searchEntries,
  serialiseEntry,
  sortEntries,
  validateEntry,
  windowEntries,
} from './journal'

function entry(over: Partial<JournalEntry> & Pick<JournalEntry, 'entry_date'>): JournalEntry {
  return {
    id: over.entry_date,
    user_id: 'u',
    text: null,
    audio_path: null,
    audio_seconds: null,
    created_at: `${over.entry_date}T20:00:00Z`,
    updated_at: `${over.entry_date}T20:00:00Z`,
    ...over,
  }
}

describe('serialise → parse round trip', () => {
  it('round-trips all three sections', () => {
    const sections = {
      done: 'Shipped the beta.\nAnswered the backlog.',
      better: 'Started too late.',
      notes: 'Sleep earlier.',
    }
    expect(parseEntry(serialiseEntry(sections))).toEqual(sections)
  })

  it('omits empty sections from the document entirely', () => {
    const text = serialiseEntry({ done: 'One thing', better: '', notes: '' })
    expect(text).toBe('## What got done\nOne thing')
    expect(parseEntry(text)).toEqual({ done: 'One thing', better: '', notes: '' })
  })

  it('produces nothing at all for an empty entry', () => {
    expect(serialiseEntry(EMPTY_SECTIONS)).toBe('')
    expect(parseEntry('')).toEqual(EMPTY_SECTIONS)
    expect(parseEntry(null)).toEqual(EMPTY_SECTIONS)
    expect(parseEntry('   \n  \n')).toEqual(EMPTY_SECTIONS)
  })

  it('keeps blank lines and indentation inside a section', () => {
    const sections = { done: 'One\n\n  two indented\n\nthree', better: '', notes: '' }
    expect(parseEntry(serialiseEntry(sections)).done).toBe(sections.done)
  })
})

describe('parseEntry never loses what someone typed', () => {
  it('treats text written above the first heading as notes', () => {
    const parsed = parseEntry('Just a thought.\n\n## What got done\nShipped it.')
    expect(parsed.notes).toBe('Just a thought.')
    expect(parsed.done).toBe('Shipped it.')
  })

  it('reads an entry that has no headings at all as notes', () => {
    // Everything written before this format existed, and every paste.
    expect(parseEntry('Long day. Nothing else to say.').notes).toBe(
      'Long day. Nothing else to say.',
    )
  })

  it("keeps the USER'S own heading, verbatim, rather than eating it", () => {
    const parsed = parseEntry('## What got done\nShipped it.\n\n## Ideas\nA new landing page.')
    expect(parsed.done).toBe('Shipped it.')
    // The heading survives, so editing and re-saving does not destroy structure
    // this build did not invent.
    expect(parsed.notes).toBe('## Ideas\nA new landing page.')
  })

  it('survives a section written twice, by joining rather than overwriting', () => {
    const parsed = parseEntry(
      '## What got done\nFirst.\n\n## What could go better\nHmm.\n\n## What got done\nSecond.',
    )
    expect(parsed.done).toBe('First.\n\nSecond.')
    expect(parsed.better).toBe('Hmm.')
  })

  it('matches headings case-insensitively and tolerates extra spacing', () => {
    const parsed = parseEntry('##   what GOT done  \nyes')
    expect(parsed.done).toBe('yes')
  })

  it('LOSES NO CHARACTERS: every word survives a parse, whatever the input', () => {
    // The property that matters. If this ever fails, someone's diary is being
    // eaten by a serialiser.
    const inputs = [
      'plain text',
      '## What got done\nA\n## Nonsense\nB\ntrailing',
      '#not a heading\n## Notes\nreal',
      '## What could go better\n\n\n## Notes\nonly this',
      'text with ## inline hashes that are not a heading',
      '## Ideas\nmine\n## What got done\ntheirs',
    ]
    for (const input of inputs) {
      const parsed = parseEntry(input)
      const survived = `${parsed.done} ${parsed.better} ${parsed.notes}`
      for (const word of input.split(/\s+/).filter((w) => w && !/^#{1,6}$/.test(w))) {
        // Recognised headings are structure, not content — everything else must
        // still be findable in one of the three sections.
        if (/^(what|got|done|could|go|better|notes)$/i.test(word)) continue
        expect(survived, `"${word}" was lost from: ${JSON.stringify(input)}`).toContain(word)
      }
    }
  })
})

describe('validation', () => {
  it('refuses an entry with nothing in it', () => {
    expect(validateEntry(EMPTY_SECTIONS)).toEqual({ ok: false, error: 'Write something first.' })
    expect(hasContent(EMPTY_SECTIONS)).toBe(false)
    expect(hasContent({ done: '', better: '  ', notes: 'x' })).toBe(true)
  })

  it('refuses one longer than the column allows', () => {
    const long = { done: 'x'.repeat(MAX_ENTRY_CHARS + 1), better: '', notes: '' }
    expect(validateEntry(long).ok).toBe(false)
  })

  it('accepts an ordinary entry', () => {
    expect(validateEntry({ done: 'Enough', better: '', notes: '' })).toEqual({ ok: true })
  })
})

describe('listing', () => {
  const entries = [entry({ entry_date: '2026-03-01' }), entry({ entry_date: '2026-03-05' }), entry({ entry_date: '2026-03-03' })]

  it('reads backwards — newest first', () => {
    expect(sortEntries(entries).map((e) => e.entry_date)).toEqual([
      '2026-03-05',
      '2026-03-03',
      '2026-03-01',
    ])
  })

  it('finds the entry for a day, or null', () => {
    expect(entryForDay(entries, '2026-03-03')?.entry_date).toBe('2026-03-03')
    expect(entryForDay(entries, '2026-03-02')).toBeNull()
  })

  it('searches the words actually written', () => {
    const withText = [
      entry({ entry_date: '2026-03-01', text: '## Notes\nThe launch went fine.' }),
      entry({ entry_date: '2026-03-02', text: '## Notes\nQuiet day.' }),
    ]
    expect(searchEntries(withText, 'launch').map((e) => e.entry_date)).toEqual(['2026-03-01'])
    expect(searchEntries(withText, 'LAUNCH')).toHaveLength(1)
    // An empty query is not a filter.
    expect(searchEntries(withText, '   ')).toHaveLength(2)
  })

  it('windows history without deleting anything, and says how much is hidden', () => {
    const all = [
      entry({ entry_date: '2026-03-10' }),
      entry({ entry_date: '2026-03-01' }),
      entry({ entry_date: '2026-02-01' }),
    ]
    const windowed = windowEntries(all, '2026-03-05')
    expect(windowed.visible.map((e) => e.entry_date)).toEqual(['2026-03-10'])
    expect(windowed.hiddenCount).toBe(2)
  })

  it('returns the SAME array for an unlimited plan, so upgrading needs no refetch', () => {
    const all = [entry({ entry_date: '2026-03-10' })]
    const windowed = windowEntries(all, null)
    expect(windowed.visible).toBe(all)
    expect(windowed.hiddenCount).toBe(0)
  })
})

describe('presentation', () => {
  it('previews the first real line, never a heading', () => {
    const e = entry({ entry_date: '2026-03-01', text: '## What got done\nShipped the beta.' })
    expect(previewOf(e)).toBe('Shipped the beta.')
  })

  it('falls back through the sections when the first is empty', () => {
    const e = entry({ entry_date: '2026-03-01', text: '## What could go better\nStarted late.' })
    expect(previewOf(e)).toBe('Started late.')
  })

  it('ellipsises a long preview', () => {
    const e = entry({ entry_date: '2026-03-01', text: `## Notes\n${'x'.repeat(200)}` })
    expect(previewOf(e, 20)).toHaveLength(20)
    expect(previewOf(e, 20).endsWith('…')).toBe(true)
  })

  it('is empty rather than broken for an entry with only audio', () => {
    expect(previewOf(entry({ entry_date: '2026-03-01', audio_path: 'u/x.webm', audio_seconds: 12 }))).toBe('')
  })

  it('formats a duration a person can read', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(300)).toBe('5:00')
    expect(formatDuration(-5)).toBe('0:00')
  })
})

describe('audioKey', () => {
  it('puts the user id FIRST, because that is what the storage policy checks', () => {
    const key = audioKey('11111111-2222-3333-4444-555555555555', '2026-03-01', 'abc')
    expect(key.startsWith('11111111-2222-3333-4444-555555555555/')).toBe(true)
    expect(key.endsWith('.webm')).toBe(true)
    // The first path segment IS the authorisation — see the migration.
    expect(key.split('/')[0]).toBe('11111111-2222-3333-4444-555555555555')
  })

  it('gives two recordings on the same day different keys', () => {
    expect(audioKey('u', '2026-03-01', 'a')).not.toBe(audioKey('u', '2026-03-01', 'b'))
  })
})
