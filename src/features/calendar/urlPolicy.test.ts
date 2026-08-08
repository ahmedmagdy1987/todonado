import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CALENDAR_URL_CASES, MAX_CALENDAR_URL_LENGTH, checkCalendarUrl } from './urlPolicy'

/**
 * The CLIENT half of the FLAG-5 write-time URL policy.
 *
 * `db-tests/calendarSourcesGuard.db.test.ts` runs the SAME
 * `CALENDAR_URL_CASES` table against `public.calendar_url_is_safe` on a real
 * PostgreSQL, so a disagreement between the TypeScript and the SQL fails a
 * suite rather than reaching a user as a raw 23514.
 */

describe('the shared truth table', () => {
  it('has no duplicate URLs, so no case can be silently overwritten', () => {
    const seen = new Map<string, number>()
    for (const c of CALENDAR_URL_CASES) seen.set(c.url, (seen.get(c.url) ?? 0) + 1)
    expect([...seen].filter(([, n]) => n > 1).map(([u]) => u)).toEqual([])
  })

  it('exercises both directions, so it cannot pass by only ever rejecting', () => {
    const accepted = CALENDAR_URL_CASES.filter((c) => c.ok).length
    expect(accepted).toBeGreaterThanOrEqual(10)
    expect(CALENDAR_URL_CASES.length - accepted).toBeGreaterThanOrEqual(20)
  })

  it('every case says what it is for', () => {
    expect(CALENDAR_URL_CASES.filter((c) => c.note.trim().length < 4)).toEqual([])
  })
})

describe('checkCalendarUrl agrees with the shared truth table', () => {
  for (const { url, ok, note } of CALENDAR_URL_CASES) {
    it(`${ok ? 'accepts' : 'rejects'} ${JSON.stringify(url)} (${note})`, () => {
      expect(checkCalendarUrl(url).ok).toBe(ok)
    })
  }
})

describe('the refusals are specific enough to act on', () => {
  const problemOf = (url: string) => {
    const verdict = checkCalendarUrl(url)
    return verdict.ok ? null : verdict.problem
  }

  it('names the actual reason rather than a generic invalid', () => {
    expect(problemOf('')).toBe('empty')
    expect(problemOf('ftp://example.com/a.ics')).toBe('bad_scheme')
    expect(problemOf('https://user:pass@example.com/a.ics')).toBe('has_credentials')
    expect(problemOf('https://169.254.169.254/a.ics')).toBe('ip_literal')
    expect(problemOf('https://[::1]/a.ics')).toBe('ip_literal')
    expect(problemOf('https://example.com:8080/a.ics')).toBe('bad_port')
    expect(problemOf('https://localhost/a.ics')).toBe('not_a_domain')
    expect(problemOf(`https://example.com/${'a'.repeat(MAX_CALENDAR_URL_LENGTH)}`)).toBe('too_long')
  })

  it('every message is something a person could act on', () => {
    for (const { url, ok } of CALENDAR_URL_CASES) {
      if (ok) continue
      const verdict = checkCalendarUrl(url)
      if (verdict.ok) continue
      expect(verdict.message.length, `${url} -> ${verdict.problem}`).toBeGreaterThan(20)
      // No error codes or SQLSTATEs leaking into UI copy.
      expect(verdict.message).not.toMatch(/23514|check_violation|PGRST|null/)
    }
  })
})

describe('the source itself', () => {
  const SOURCE = readFileSync(fileURLToPath(new URL('./urlPolicy.ts', import.meta.url)), 'utf8')

  it('contains no literal control characters', () => {
    /*
     * A REGRESSION GUARD WITH A STORY. An earlier revision of the whitespace
     * check carried the raw control BYTES of its character class instead of the
     * escapes, which rendered as an innocent-looking class, made the file
     * binary to grep, and would have survived every review.
     */
    const offenders = [...SOURCE].filter((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return (code < 0x20 && ch !== '\n') || code === 0x7f
    })
    expect(offenders).toEqual([])
  })

  it('does not use new URL(), which would decide the question differently to SQL', () => {
    // Comments stripped first: the header EXPLAINS why `new URL()` is avoided,
    // and a scan that cannot tell prose from code would fail on its own rationale.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
    expect(code).not.toMatch(/new URL\(/)
  })
})
