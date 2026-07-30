import type { JournalEntry } from '@/types/database'
import { windowDayKeys } from '@/features/history/historyWindow'

/**
 * Journal — pure logic. No React, no I/O — unit-tested.
 *
 * ── THE SERIALISER IS THE INTERESTING PART ───────────────────────────────────
 * The entry is ONE text column (see the migration header) while the form has
 * three prompts. So the sections are written into a single document with stable
 * headings and read back out again.
 *
 * That round trip has to be safe in a way most serialisers are not, because the
 * input is a person typing. They will paste text that contains "##". They will
 * write above the first heading. They will have entries from before the prompts
 * existed. So `parseEntry` NEVER throws and NEVER drops characters: anything it
 * does not recognise lands in `notes`, which is the section that has no rules.
 * The invariant the tests pin is that no keystroke can be lost.
 */

/** Mirrors the DB CHECK in 20260731140000_journal_entries.sql. */
export const MAX_ENTRY_CHARS = 8000
/** Also a bucket-level limit, and the recorder's own stop. */
export const MAX_AUDIO_SECONDS = 300
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024

export interface EntrySections {
  /** "What got done?" */
  done: string
  /** "What could go better?" */
  better: string
  /** Anything else — and the home for anything unparseable. */
  notes: string
}

export const EMPTY_SECTIONS: EntrySections = { done: '', better: '', notes: '' }

/**
 * The headings. Deliberately plain markdown so an exported entry reads as a
 * normal document rather than as a serialisation format — this text belongs to
 * the user and should look like it.
 */
const HEADING = {
  done: '## What got done',
  better: '## What could go better',
  notes: '## Notes',
} as const

const HEADING_LINE = /^##\s+(.+?)\s*$/

/** Which section a heading names, or null if it is just the user's own "##". */
function sectionFor(heading: string): keyof EntrySections | null {
  const h = heading.trim().toLowerCase()
  if (h === 'what got done') return 'done'
  if (h === 'what could go better') return 'better'
  if (h === 'notes') return 'notes'
  return null
}

/** Sections → one document. Empty sections are omitted entirely. */
export function serialiseEntry(sections: EntrySections): string {
  const parts: string[] = []
  for (const key of ['done', 'better', 'notes'] as const) {
    const body = sections[key].trim()
    if (body) parts.push(`${HEADING[key]}\n${body}`)
  }
  return parts.join('\n\n')
}

/**
 * One document → sections. Never throws.
 *
 * Anything before the first recognised heading, and anything under a heading
 * this build does not know, is appended to `notes` WITH its heading intact — so
 * a user's own "## Ideas" survives editing round trips instead of silently
 * becoming a bare paragraph, and text from a future build is preserved rather
 * than destroyed by an older one.
 */
export function parseEntry(text: string | null): EntrySections {
  if (!text || !text.trim()) return { ...EMPTY_SECTIONS }

  const out: EntrySections = { ...EMPTY_SECTIONS }
  /** Where lines go until a recognised heading says otherwise. */
  let current: keyof EntrySections = 'notes'
  let buffer: string[] = []

  const flush = () => {
    if (buffer.length === 0) return
    const body = buffer.join('\n').trim()
    buffer = []
    if (!body) return
    out[current] = out[current] ? `${out[current]}\n\n${body}` : body
  }

  for (const line of text.split('\n')) {
    const match = HEADING_LINE.exec(line)
    if (!match) {
      buffer.push(line)
      continue
    }
    const target = sectionFor(match[1])
    if (target) {
      flush()
      current = target
      continue
    }
    // An unrecognised heading is the USER'S heading. Keep it verbatim, in notes.
    flush()
    current = 'notes'
    buffer.push(line)
  }
  flush()
  return out
}

/** Is there anything worth saving? */
export function hasContent(sections: EntrySections): boolean {
  return serialiseEntry(sections).trim().length > 0
}

export type ValidationResult = { ok: true } | { ok: false; error: string }

export function validateEntry(sections: EntrySections): ValidationResult {
  const text = serialiseEntry(sections)
  if (!text.trim()) return { ok: false, error: 'Write something first.' }
  if (text.length > MAX_ENTRY_CHARS) {
    return { ok: false, error: `That is longer than ${MAX_ENTRY_CHARS} characters.` }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
//  Listing
// ---------------------------------------------------------------------------

/** Newest first — a journal is read backwards. */
export function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  return entries.slice().sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : 0))
}

/**
 * Apply the plan's history window, exactly as completed tasks are windowed.
 *
 * `cutoffDay` null means unlimited (Pro). NOTHING IS DELETED — this is a view
 * limit and upgrading reveals everything on the next render, which is why the
 * hidden count is returned rather than swallowed: the page says how much is out
 * of view instead of pretending the journal starts 14 days ago.
 */
export function windowEntries(
  entries: JournalEntry[],
  cutoffDay: string | null,
): { visible: JournalEntry[]; hiddenCount: number } {
  if (!cutoffDay) return { visible: entries, hiddenCount: 0 }
  const keep = windowDayKeys(new Set(entries.map((e) => e.entry_date)), cutoffDay)
  const visible = entries.filter((e) => keep.has(e.entry_date))
  return { visible, hiddenCount: entries.length - visible.length }
}

/**
 * Free-text search across the entries' own words.
 *
 * Case-insensitive substring, and deliberately nothing cleverer: ranking or
 * stemming would need a judgement about what someone's diary "means", which is
 * exactly the thing this feature refuses to do without asking.
 */
export function searchEntries(entries: JournalEntry[], query: string): JournalEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter((e) => (e.text ?? '').toLowerCase().includes(q))
}

/** The entry for a given local day, or null. */
export function entryForDay(entries: JournalEntry[], day: string): JournalEntry | null {
  return entries.find((e) => e.entry_date === day) ?? null
}

/** First line of the entry, for the list. Never leaks a heading. */
export function previewOf(entry: JournalEntry, max = 90): string {
  const sections = parseEntry(entry.text)
  const body = sections.done || sections.better || sections.notes
  const line = body.split('\n').find((l) => l.trim()) ?? ''
  const clean = line.trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

/** "2:05" — a duration a person reads, not 125. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The storage key for a recording.
 *
 * THE USER ID IS THE FIRST PATH SEGMENT, and that is not cosmetic: the storage
 * policies require `(storage.foldername(name))[1] = auth.uid()::text`, so this
 * shape IS the authorisation. A key built any other way is rejected by the
 * database rather than quietly stored somewhere readable.
 */
export function audioKey(userId: string, entryDate: string, unique: string): string {
  return `${userId}/${entryDate}-${unique}.webm`
}
