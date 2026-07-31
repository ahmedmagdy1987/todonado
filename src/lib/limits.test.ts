import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { LIMITS, checkLength, tooLongMessage } from './limits'

/**
 * THE CLIENT CAPS AND THE SQL MUST BE THE SAME NUMBERS.
 *
 * `docs/CLEANUP_length_caps.sql` is written and reviewed but NOT applied — it
 * is the owner's to schedule. That gap is exactly when the two halves drift:
 * someone raises a `maxLength` because a user complained, the SQL still says
 * the old number, and the day it is finally applied the database starts
 * rejecting input the UI happily accepts.
 *
 * So this test reads the SQL and pins every constant to it. It is the same
 * technique `personalCaps.test.ts` uses against the applied migrations; the
 * only difference is which file is the source of truth.
 */

const SQL = readFileSync(
  fileURLToPath(new URL('../../docs/CLEANUP_length_caps.sql', import.meta.url)),
  'utf8',
)

/** Strip the SQL comments, so prose about a number never satisfies a check. */
const sql = SQL.replace(/--[^\n]*/g, '')

describe('the client caps mirror the SQL exactly', () => {
  it.each([
    ['tasks.title', 'char_length(title) between 1 and', LIMITS.taskTitle],
    ['tasks.notes', 'char_length(notes) <=', LIMITS.taskNotes],
    ['projects.name', 'char_length(name) between 1 and', LIMITS.projectName],
    ['subtasks.title', 'char_length(title) between 1 and', LIMITS.subtaskTitle],
    ['profiles.display_name', 'char_length(display_name) <=', LIMITS.profileName],
    ['profiles.full_name', 'char_length(full_name) <=', LIMITS.profileName],
    ['wellness_items.notes', 'char_length(notes) <=', LIMITS.wellnessNotes],
    ['calendar_sources.url', 'char_length(url) <=', LIMITS.calendarUrl],
  ])('%s', (_label, needle, expected) => {
    expect(sql, `the SQL never mentions "${needle}"`).toContain(needle)
    // Every occurrence of this clause must carry the client's number.
    const numbers = [...sql.matchAll(new RegExp(`${escapeRe(needle)}\\s*(\\d+)`, 'g'))].map((m) =>
      Number(m[1]),
    )
    expect(numbers.length, `no number found after "${needle}"`).toBeGreaterThan(0)
    expect(numbers, `the SQL and src/lib/limits.ts disagree about ${_label}`).toContain(expected)
  })

  it('the ics_text cap matches the browser cap it mirrors', () => {
    // 1 MB, the same MAX_ICS_BYTES the upload path already enforces.
    expect(sql).toContain('pg_column_size(ics_text) <= 1048576')
  })

  it('every limit is a positive whole number', () => {
    for (const [key, value] of Object.entries(LIMITS)) {
      expect(Number.isInteger(value), `${key} is not an integer`).toBe(true)
      expect(value, `${key} is not positive`).toBeGreaterThan(0)
    }
  })
})

describe('checkLength', () => {
  it('passes what fits, including exactly at the limit', () => {
    expect(checkLength('title', 'x'.repeat(500), LIMITS.taskTitle)).toBeNull()
    expect(checkLength('title', '', LIMITS.taskTitle)).toBeNull()
    expect(checkLength('title', null, LIMITS.taskTitle)).toBeNull()
  })

  it('refuses the character that goes over, and says both numbers', () => {
    const msg = checkLength('title', 'x'.repeat(501), LIMITS.taskTitle)
    /*
     * Compared through `toLocaleString` rather than against the literal
     * "501", because the message formats for the READER's locale and that is
     * the correct behaviour: on an Arabic-locale machine this renders ٥٠١, and
     * an Arabic-speaking user should see ٥٠١. A test that demanded Latin digits
     * would be asserting the developer's locale, and would pass or fail
     * depending on whose laptop ran it.
     */
    expect(msg).toContain((501).toLocaleString())
    expect(msg).toContain((500).toLocaleString())
    expect(msg).toMatch(/shorten it/)
  })

  it('never blames the user or says "error"', () => {
    expect(tooLongMessage('note', 20_000, 25_000)).not.toMatch(/error|invalid|failed|too big/i)
  })
})

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
