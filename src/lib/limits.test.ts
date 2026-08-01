import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { LIMITS, checkLength, tooLongMessage } from './limits'

/**
 * THE CLIENT CAPS AND THE MIGRATION MUST BE THE SAME NUMBERS.
 *
 * `supabase/migrations/20260801120000_length_caps.sql` is committed and NOT
 * applied; it is the owner's to schedule. That gap is exactly when the two
 * halves drift: someone raises a `maxLength` because a user complained, the SQL
 * still says the old number, and the day it is finally applied the database
 * starts rejecting input the UI happily accepts.
 *
 * So this test reads the migration and pins every constant to it. Same
 * technique as `personalCaps.test.ts` / `quitCaps.test.ts` / `mindMapCaps.ts`;
 * the only difference is that this one guards a file that has not run yet.
 *
 * ── WHY IT PARSES CONSTRAINT BY CONSTRAINT ───────────────────────────────────
 * The first version searched the whole file for a needle like
 * `char_length(name) between 1 and` and asserted the number after it appeared
 * somewhere. That clause occurs THREE times (projects, sections,
 * wellness_items) and all three happen to be 200, so a single matching
 * occurrence satisfied the assertion for all of them — and three of the ten
 * constants (`sectionName`, `wellnessShort`, `calendarLabel`) had no assertion
 * of their own at all. Changing `sectionName` to 300 would have left the suite
 * green. Extracting each named constraint and asserting inside its own body is
 * what makes the pin real.
 */

const SQL = readFileSync(
  fileURLToPath(
    new URL('../../supabase/migrations/20260801120000_length_caps.sql', import.meta.url),
  ),
  'utf8',
)

/** Strip `-- …` comments, so prose about a number never satisfies a check. */
const sql = SQL.replace(/--[^\n]*/g, '')

/**
 * Every `add constraint <name> check ( … )` in the file, by name.
 *
 * Non-greedy up to the `;` that ends the ALTER, which is safe because no CHECK
 * body here contains a semicolon.
 */
function constraintBodies(source: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of source.matchAll(/add constraint\s+(\w+)\s+check\s*\(([\s\S]*?)\);/g)) {
    out.set(m[1], m[2])
  }
  return out
}

const BODIES = constraintBodies(sql)

/** The number in `<needle> <n>` inside one constraint body. */
function capIn(constraint: string, needle: string): number | null {
  const body = BODIES.get(constraint)
  if (body == null) return null
  const m = new RegExp(`${escapeRe(needle)}\\s*(\\d+)`).exec(body)
  return m ? Number(m[1]) : null
}

describe('the client caps mirror the migration exactly', () => {
  it('the migration declares every constraint this test knows about', () => {
    // If a constraint is renamed or dropped, every row below would silently
    // read `null` and could be made to pass by a careless edit. Pin the set.
    expect([...BODIES.keys()].sort()).toEqual([
      'calendar_sources_len',
      'profiles_display_name_len',
      'profiles_full_name_len',
      'projects_name_len',
      'sections_name_len',
      'subtasks_title_len',
      'tasks_notes_len',
      'tasks_title_len',
      'wellness_items_len',
    ])
  })

  it.each([
    ['tasks.title', 'tasks_title_len', 'char_length(title) between 1 and', LIMITS.taskTitle],
    ['tasks.notes', 'tasks_notes_len', 'char_length(notes) <=', LIMITS.taskNotes],
    ['projects.name', 'projects_name_len', 'char_length(name) between 1 and', LIMITS.projectName],
    ['sections.name', 'sections_name_len', 'char_length(name) between 1 and', LIMITS.sectionName],
    [
      'subtasks.title',
      'subtasks_title_len',
      'char_length(title) between 1 and',
      LIMITS.subtaskTitle,
    ],
    [
      'profiles.display_name',
      'profiles_display_name_len',
      'char_length(display_name) <=',
      LIMITS.profileName,
    ],
    [
      'profiles.full_name',
      'profiles_full_name_len',
      'char_length(full_name) <=',
      LIMITS.profileName,
    ],
    ['wellness_items.name', 'wellness_items_len', 'char_length(name) between 1 and', LIMITS.wellnessShort],
    ['wellness_items.dose', 'wellness_items_len', 'char_length(dose) <=', LIMITS.wellnessShort],
    [
      'wellness_items.schedule',
      'wellness_items_len',
      'char_length(schedule) <=',
      LIMITS.wellnessShort,
    ],
    ['wellness_items.notes', 'wellness_items_len', 'char_length(notes) <=', LIMITS.wellnessNotes],
    [
      'calendar_sources.label',
      'calendar_sources_len',
      'char_length(label) between 1 and',
      LIMITS.calendarLabel,
    ],
    ['calendar_sources.url', 'calendar_sources_len', 'char_length(url) <=', LIMITS.calendarUrl],
  ])('%s', (label, constraint, needle, expected) => {
    const found = capIn(constraint, needle)
    expect(found, `${constraint} has no "${needle} <n>" clause`).not.toBeNull()
    expect(found, `the migration and src/lib/limits.ts disagree about ${label}`).toBe(expected)
  })

  it('the ics_text cap matches the browser cap it mirrors', () => {
    // 1 MB, the same MAX_ICS_BYTES the upload path already enforces. Measured
    // with pg_column_size (stored bytes) rather than char_length, because what
    // hurts is the row being fetched and re-parsed on every render.
    expect(BODIES.get('calendar_sources_len')).toContain('pg_column_size(ics_text) <= 1048576')
  })

  it('every constant in LIMITS is actually pinned by a row above', () => {
    // The gap that made the first version of this file a formality: a constant
    // nobody asserts is a constant nobody notices changing.
    const asserted = new Set<number>()
    for (const [, constraint, needle] of [
      ['', 'tasks_title_len', 'char_length(title) between 1 and'],
      ['', 'tasks_notes_len', 'char_length(notes) <='],
      ['', 'projects_name_len', 'char_length(name) between 1 and'],
      ['', 'sections_name_len', 'char_length(name) between 1 and'],
      ['', 'subtasks_title_len', 'char_length(title) between 1 and'],
      ['', 'profiles_display_name_len', 'char_length(display_name) <='],
      ['', 'wellness_items_len', 'char_length(name) between 1 and'],
      ['', 'wellness_items_len', 'char_length(notes) <='],
      ['', 'calendar_sources_len', 'char_length(label) between 1 and'],
      ['', 'calendar_sources_len', 'char_length(url) <='],
    ] as const) {
      const n = capIn(constraint, needle)
      if (n != null) asserted.add(n)
    }
    for (const [key, value] of Object.entries(LIMITS)) {
      expect(asserted, `LIMITS.${key} (${value}) is not pinned to any constraint`).toContain(value)
    }
  })

  it('every limit is a positive whole number', () => {
    for (const [key, value] of Object.entries(LIMITS)) {
      expect(Number.isInteger(value), `${key} is not an integer`).toBe(true)
      expect(value, `${key} is not positive`).toBeGreaterThan(0)
    }
  })

  it('is re-runnable, and checks the TABLE as well as the constraint name', () => {
    // A constraint name is unique per table, not per database. Matching on the
    // name alone would skip the work if any other table ever carried the same
    // one, which is the kind of thing that only shows up years later.
    const guards = [...sql.matchAll(/where conname = '(\w+)' and conrelid = '([\w.]+)'::regclass/g)]
    expect(guards.length, 'the idempotency guards are not table-qualified').toBe(BODIES.size)
  })

  it('never runs the dry-run select as part of the migration', () => {
    // A migration that returns a result set has nowhere to put it: db push
    // discards it, so it looks like it passed while telling nobody anything.
    expect(sql).not.toMatch(/^\s*select\b.*\bfrom public\./im)
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
