/**
 * Structural policy for a calendar subscription URL — the CLIENT half.
 *
 * ── THE THREE LAYERS, AND WHICH ONE IS AUTHORITATIVE ────────────────────────
 *
 *   this file        UX. A specific, friendly refusal before a round trip.
 *   the CHECK        ENFORCEMENT. supabase/migrations/20260808120000_… — the
 *                    only writer is the browser, so the database is where a
 *                    rule becomes real.
 *   ssrf.ts          AUTHORITATIVE AT FETCH TIME. It resolves DNS and inspects
 *                    the address; neither of the other two can.
 *
 * Same framing as `src/lib/limits.ts`: this is explicitly the WEAKER half. Its
 * job is that a person who pastes something wrong is told what is wrong, rather
 * than meeting a raw `23514` from PostgREST.
 *
 * ── WHY IT DOES NOT USE `new URL()` ─────────────────────────────────────────
 *
 * The database cannot. `URL` normalises, lowercases, punycodes and resolves
 * relative forms, so a string it accepts is not necessarily the string the
 * CHECK sees — and the value stored is the RAW one the user typed. Deciding the
 * same question two different ways is how the halves drift. This decomposes the
 * string with the same steps the SQL function uses, in the same order, and
 * `CALENDAR_URL_CASES` below is run against BOTH implementations so a
 * divergence fails a test instead of surprising a user.
 */

import { LIMITS } from '@/lib/limits'

/** Schemes a subscription may use. `webcal:` is what Apple and Google hand out. */
const SCHEMES = ['http', 'https', 'webcal'] as const

/** Mirrors ALLOWED_PORTS in api/_lib/ssrf.ts. */
const PORTS = ['80', '443'] as const

export type CalendarUrlProblem =
  | 'empty'
  | 'whitespace'
  | 'bad_scheme'
  | 'no_host'
  | 'has_credentials'
  | 'ip_literal'
  | 'bad_port'
  | 'not_a_domain'
  | 'too_long'

/**
 * `calendar_sources.url` CHECK — `char_length(url) <= 2048`, via the single
 * constant `limits.test.ts` already pins to that migration. A fourth copy of
 * 2048 (ssrf.ts and calendarLimits.ts hold the server ones) would be one more
 * thing to keep true.
 */
export const MAX_CALENDAR_URL_LENGTH = LIMITS.calendarUrl

const MESSAGES: Record<CalendarUrlProblem, string> = {
  empty: 'Paste the .ics link for the calendar you want to subscribe to.',
  whitespace: 'That link contains a space. Copy it again from your calendar provider.',
  bad_scheme: 'A calendar link has to start with https://, http:// or webcal://.',
  no_host: 'That link has no website address in it.',
  has_credentials:
    'That link has a username or password in it. Calendar links use a secret path instead, so copy the plain subscribe link.',
  ip_literal:
    'That link points at a raw IP address. Use the address your calendar provider gave you.',
  bad_port: 'That link uses an unusual port. Calendar links use the standard web ports.',
  not_a_domain:
    'That link points at a name with no domain, like localhost. Use your provider’s public link.',
  too_long: `That link is longer than ${MAX_CALENDAR_URL_LENGTH.toLocaleString()} characters, which no real calendar link is.`,
}

export type CalendarUrlVerdict =
  | { ok: true }
  | { ok: false; problem: CalendarUrlProblem; message: string }

const reject = (problem: CalendarUrlProblem): CalendarUrlVerdict => ({
  ok: false,
  problem,
  message: MESSAGES[problem],
})

/**
 * True for any space or C0/DEL control character.
 *
 * NOT a regex, and not for style. A character class for this has to spell the
 * control range with backslash-u escapes, and those are invisible in review:
 * an earlier revision of this line shipped the raw control BYTES instead of
 * the escapes. It still read as an innocent character class and it silently
 * made the file binary to grep. Comparing code points cannot be misread that
 * way. 0x20 is the space itself, so a single `<= 0x20` covers both cases.
 */
function hasSpaceOrControl(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (code <= 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * The same decomposition the SQL function performs, in the same order, so the
 * two agree on every case in `CALENDAR_URL_CASES`.
 */
export function checkCalendarUrl(raw: string): CalendarUrlVerdict {
  if (!raw) return reject('empty')
  if (raw.length > MAX_CALENDAR_URL_LENGTH) return reject('too_long')
  /*
   * Whitespace and C0/DEL control characters. Anything legitimate in a URL is
   * percent-encoded, so this rejects nothing real.
   *
   * Written with ESCAPES, not literal bytes: a control character pasted into
   * source is invisible in every diff and review that will ever look at it.
   */
  if (hasSpaceOrControl(raw)) return reject('whitespace')

  const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(raw)
  if (!schemeMatch) return reject('bad_scheme')
  const scheme = schemeMatch[1].toLowerCase()
  if (!(SCHEMES as readonly string[]).includes(scheme)) return reject('bad_scheme')

  // Everything after "://" up to the first '/', '?' or '#'.
  const authority = raw.slice(schemeMatch[0].length).split(/[/?#]/, 1)[0]
  if (!authority) return reject('no_host')
  if (authority.includes('@')) return reject('has_credentials')
  // A bracketed authority is an IPv6 literal.
  if (authority.startsWith('[')) return reject('ip_literal')

  let host = authority
  const colon = authority.indexOf(':')
  if (colon !== -1) {
    host = authority.slice(0, colon)
    const port = authority.slice(colon + 1)
    if (!(PORTS as readonly string[]).includes(port)) return reject('bad_port')
  }
  if (!host) return reject('no_host')

  // An all-numeric dotted host is an IPv4 literal in any of its forms.
  if (/^[0-9]+(\.[0-9]+)*$/.test(host)) return reject('ip_literal')

  // At least one dot, and a final label starting with a letter so punycode TLDs
  // (xn--p1ai) pass while a trailing numeric label does not.
  if (!/^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]{1,62}$/.test(host)) {
    return reject('not_a_domain')
  }

  return { ok: true }
}

/**
 * THE SHARED TRUTH TABLE.
 *
 * Run by `urlPolicy.test.ts` against `checkCalendarUrl`, and by
 * `db-tests/calendarSourcesGuard.db.test.ts` against
 * `public.calendar_url_is_safe` on a real PostgreSQL. Two implementations of
 * one policy in two languages is a drift risk; one table both must satisfy is
 * how that risk is paid for.
 *
 * `note` says what the case is FOR, so a future edit that flips an expectation
 * has to argue with a sentence rather than with a boolean.
 *
 * ── DO NOT PUT LENGTH CASES HERE ────────────────────────────────────────────
 *
 * The two implementations deliberately DISAGREE about length, so a length case
 * in this table would fail the SQL comparison for the wrong reason.
 * `checkCalendarUrl` reports `too_long` as a courtesy; `calendar_url_is_safe`
 * says nothing about length because the database enforces it separately in the
 * `calendar_sources_len` CHECK, which predates all of this. Length is covered
 * by a TypeScript-only case below and by an INSERT test in the database suite.
 */
export const CALENDAR_URL_CASES: readonly {
  url: string
  ok: boolean
  note: string
}[] = [
  // ── accepted ──────────────────────────────────────────────────────────────
  { url: 'https://calendar.google.com/calendar/ical/x/basic.ics', ok: true, note: 'the common case' },
  { url: 'http://example.com/a.ics', ok: true, note: 'http is allowed; fetch-time decides the rest' },
  { url: 'webcal://p01.calendar.icloud.com/published/2/abc', ok: true, note: 'what Apple hands you' },
  { url: 'HTTPS://Example.COM/a.ics', ok: true, note: 'scheme and host case are insignificant' },
  { url: 'https://example.com:443/a.ics', ok: true, note: 'explicit default port' },
  { url: 'https://example.com:80/a.ics', ok: true, note: 'the other standard web port' },
  { url: 'https://outlook.office365.com/owa/calendar/x/reachcalendar.ics', ok: true, note: 'Outlook published calendar' },
  { url: 'https://xn--e1afmkfd.xn--p1ai/a.ics', ok: true, note: 'punycode TLD must not be mistaken for an IP' },
  { url: 'https://a.b.c.example.co.uk/a.ics', ok: true, note: 'deep subdomains and a two-part TLD' },
  { url: 'https://example.com/path%20with%20space.ics', ok: true, note: 'percent-encoding is not whitespace' },
  { url: 'https://example.com/a.ics?token=x&y=z#frag', ok: true, note: 'query and fragment are not the authority' },
  { url: 'https://ex-ample.com/a.ics', ok: true, note: 'internal hyphens are legal' },
  { url: 'https://example.com', ok: true, note: 'no path at all is still a URL' },

  // ── rejected: scheme ──────────────────────────────────────────────────────
  { url: '', ok: false, note: 'the empty string' },
  { url: 'example.com/a.ics', ok: false, note: 'no scheme' },
  { url: 'ftp://example.com/a.ics', ok: false, note: 'unsupported scheme' },
  { url: 'file:///etc/passwd', ok: false, note: 'local file scheme' },
  { url: 'gopher://example.com/a', ok: false, note: 'an old SSRF favourite' },
  { url: 'javascript://example.com/%0aalert(1)', ok: false, note: 'script scheme' },
  { url: 'data:text/calendar,BEGIN:VCALENDAR', ok: false, note: 'data URI, and it has no ://' },
  { url: '//example.com/a.ics', ok: false, note: 'protocol-relative is not a stored URL' },

  // ── rejected: credentials ─────────────────────────────────────────────────
  { url: 'https://user:pass@example.com/a.ics', ok: false, note: 'embedded credentials' },
  { url: 'https://user@example.com/a.ics', ok: false, note: 'username alone still counts' },
  { url: 'https://example.com@evil.test/a.ics', ok: false, note: 'the authority-confusion trick' },

  // ── rejected: IP literals and internal names ──────────────────────────────
  { url: 'https://169.254.169.254/latest/meta-data/', ok: false, note: 'cloud metadata' },
  { url: 'https://127.0.0.1/a.ics', ok: false, note: 'loopback' },
  { url: 'https://10.0.0.5/a.ics', ok: false, note: 'private range' },
  { url: 'https://192.168.1.1/a.ics', ok: false, note: 'private range' },
  { url: 'https://8.8.8.8/a.ics', ok: false, note: 'a PUBLIC ip literal is still refused; use a name' },
  { url: 'https://[::1]/a.ics', ok: false, note: 'IPv6 loopback' },
  { url: 'https://[fd00::1]/a.ics', ok: false, note: 'IPv6 unique-local' },
  { url: 'https://localhost/a.ics', ok: false, note: 'single-label host' },
  { url: 'https://localhost:443/a.ics', ok: false, note: 'single-label host with a legal port' },
  { url: 'https://metadata/a.ics', ok: false, note: 'single-label internal name' },
  { url: 'https://intranet/a.ics', ok: false, note: 'single-label corporate name' },
  { url: 'https://example.123/a.ics', ok: false, note: 'a numeric final label is not a TLD' },

  // ── rejected: port ────────────────────────────────────────────────────────
  { url: 'https://example.com:22/a.ics', ok: false, note: 'SSH, the classic pivot port' },
  { url: 'https://example.com:6379/a.ics', ok: false, note: 'Redis, unauthenticated by default' },
  { url: 'https://example.com:8080/a.ics', ok: false, note: 'not a standard web port' },
  { url: 'https://example.com:/a.ics', ok: false, note: 'empty port after a colon' },

  // ── rejected: malformed ───────────────────────────────────────────────────
  { url: 'https://', ok: false, note: 'no authority' },
  { url: 'https:///a.ics', ok: false, note: 'empty authority' },
  { url: 'https://exa mple.com/a.ics', ok: false, note: 'literal space in the host' },
  { url: 'https://example.com/a.ics\nHost: evil.test', ok: false, note: 'header-injection shape' },
  { url: 'https://example.com/a.ics\tx', ok: false, note: 'a tab is whitespace too' },
  { url: 'https://-example.com/a.ics', ok: false, note: 'label starts with a hyphen' },
  { url: 'https://example-.com/a.ics', ok: false, note: 'label ends with a hyphen' },
  { url: 'https://example..com/a.ics', ok: false, note: 'empty label' },
  { url: 'https://.example.com/a.ics', ok: false, note: 'leading dot' },
  { url: 'https://example.com./a.ics', ok: false, note: 'trailing dot; rejected for simplicity' },
  { url: 'https://example.c/a.ics', ok: false, note: 'one-character TLD' },

  // ── rejected: IP addresses wearing a disguise ─────────────────────────────
  // Every one of these resolves to loopback or link-local without ever looking
  // like a dotted quad. They are refused by the "must be a dotted DNS name with
  // a letter-initial final label" rule rather than by any IP-parsing.
  { url: 'https://2130706433/a.ics', ok: false, note: 'integer-encoded 127.0.0.1' },
  { url: 'https://0x7f000001/a.ics', ok: false, note: 'hex-encoded 127.0.0.1' },
  { url: 'https://0177.0.0.1/a.ics', ok: false, note: 'octal-encoded 127.0.0.1' },
  { url: 'https://127.1/a.ics', ok: false, note: 'short-form 127.0.0.1' },
  { url: 'https://[::ffff:127.0.0.1]/a.ics', ok: false, note: 'IPv4-mapped IPv6' },
  { url: 'https://2852039166/a.ics', ok: false, note: 'integer-encoded 169.254.169.254' },
  { url: 'https://localhost./a.ics', ok: false, note: 'localhost with a trailing dot' },

  // ── rejected: percent-encoding used to smuggle a host ─────────────────────
  // A percent sign is not in the label alphabet, so an encoded host cannot
  // decode into something else after this check has passed.
  { url: 'https://%6c%6f%63alhost/a.ics', ok: false, note: 'percent-encoded localhost' },
  { url: 'https://user%40evil.test/a.ics', ok: false, note: 'percent-encoded userinfo separator' },
  { url: 'https://127.0.0.1%2f.example.com/a.ics', ok: false, note: 'encoded slash inside the host' },

  // ── accepted: the target is the HOST, never the path or query ─────────────
  {
    url: 'https://cal.example.com/a.ics?redirect=https://localhost/',
    ok: true,
    note: 'a scary-looking query does not make the host internal; redirects are a fetch-time concern',
  },
  {
    url: 'https://cal.example.com/user@example.com/basic.ics',
    ok: true,
    note: 'an @ in the PATH is not userinfo, and Google feeds really look like this',
  },
]
