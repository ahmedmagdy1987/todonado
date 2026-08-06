/**
 * ABUSE CONTROLS FOR THE CALENDAR PROXY.
 *
 * ── THE PROBLEM THESE CLOSE (issue #9) ─────────────────────────────────────
 *
 * `/api/calendar-fetch` selected EVERY `calendar_sources` row of kind 'url'
 * with no `.limit()`, then looped over all of them. Nothing capped the row
 * count, deduplicated equivalent URLs, bounded concurrency, or bounded the
 * whole invocation in time.
 *
 * The only ceiling was `MAX_TOTAL_BYTES`, and it counts BYTES rather than
 * REQUESTS: a source that 404s or times out consumes no budget at all. So an
 * authenticated Pro account could insert thousands of rows pointing at one
 * target and turn a single POST into an unbounded outbound fan-out from
 * Vercel's egress addresses, terminated only by the platform timeout. That is
 * a DDoS relay with the traffic attributed to this project, and it is billable
 * function time the attacker chooses by editing their own rows.
 *
 * ── WHY THESE NUMBERS ──────────────────────────────────────────────────────
 *
 * Every limit below is a product judgement, so each one says what it is
 * protecting and why the value is not arbitrary. They are deliberately far
 * above any real user: the goal is to bound the worst case, not to police the
 * normal one.
 *
 * NOTHING HERE NEEDS A MIGRATION. The database has no row-count constraint and
 * adding one would be a schema change; these are enforced in code, at the query
 * and in the loop, which is where the damage actually happens.
 */

/**
 * How many calendar sources one invocation will ever fetch.
 *
 * A person subscribes to a handful of calendars — work, personal, a shared
 * family one, maybe a sports fixture list. Ten is generous enough that no
 * genuine user meets it, and small enough that the worst case is ten outbound
 * requests rather than ten thousand.
 */
export const MAX_SOURCES_PER_REQUEST = 10

/**
 * The row limit applied to the DATABASE QUERY itself.
 *
 * Deliberately `MAX_SOURCES_PER_REQUEST + 1`. Capping in code after loading
 * every row still transfers every row; capping at the query is what stops the
 * database and the function from doing the work at all. The one extra row is
 * how we learn that more exist without fetching them, so the response can say
 * so honestly instead of silently dropping the remainder.
 */
export const DB_QUERY_LIMIT = MAX_SOURCES_PER_REQUEST + 1

/**
 * Outbound requests in flight at once.
 *
 * The old loop was strictly sequential, which bounded fan-out but meant ten
 * slow sources took ten timeouts end to end. Three keeps the fan-out small
 * enough to be a non-event for any target while cutting worst-case wall time by
 * roughly a third — and it is what makes the aggregate deadline reachable
 * rather than theoretical.
 */
export const MAX_CONCURRENT_FETCHES = 3

/**
 * Per-source budget. Unchanged from the existing `FETCH_TIMEOUT_MS` in ssrf.ts;
 * restated here so every calendar limit is legible in one place.
 */
export const PER_SOURCE_TIMEOUT_MS = 10_000

/**
 * The whole invocation, including every source.
 *
 * THE LIMIT THAT ACTUALLY BOUNDS THE ATTACK. A per-source timeout multiplies:
 * ten sources at ten seconds is a hundred seconds of billable execution the
 * caller controls. Twenty seconds sits comfortably under Vercel's function
 * ceiling, leaves room to serialise and return whatever DID succeed, and is
 * roughly double the worst realistic case (three slow providers at ten seconds,
 * run three-wide).
 */
export const AGGREGATE_DEADLINE_MS = 20_000

/**
 * Longest URL accepted.
 *
 * Mirrors the `char_length(url) <= 2048` CHECK added by
 * 20260801120000_length_caps.sql, enforced in code so the bound holds even
 * against a row that predates the constraint. 2048 is the conventional
 * practical URL ceiling and far beyond any real calendar subscription link.
 */
export const MAX_URL_LENGTH = 2_048

/**
 * Aggregate VEVENT count across all sources in one response.
 *
 * THE SERVER DOES NOT PARSE ICS — `src/features/calendar/ics.ts` runs in the
 * browser. So this is not a parser limit; it is a bound on how much work the
 * server is willing to hand the CLIENT. Four megabytes of dense VEVENTs is a
 * tab-freezing parse on a phone, and the byte cap alone does not express that.
 *
 * Counted by scanning for the BEGIN:VEVENT delimiter, never by building an
 * array of events, so the count itself cannot be the thing that exhausts
 * memory. Five thousand is more events than a decade of a busy calendar.
 */
export const MAX_EVENTS_PER_REQUEST = 5_000

/** The delimiter every VEVENT block opens with, per RFC 5545. */
const VEVENT_OPEN = 'BEGIN:VEVENT'

/**
 * Count VEVENT blocks WITHOUT parsing or allocating.
 *
 * `indexOf` in a loop rather than `split`/`match`, because both of those build
 * an array proportional to the number of matches — which would make counting
 * events a memory-exhaustion vector in its own right on a hostile feed.
 *
 * Case-insensitive on the delimiter only: RFC 5545 property names are
 * case-insensitive, and a feed using `Begin:vEvent` is unusual but legal.
 */
export function countVevents(ics: string): number {
  const haystack = ics.toUpperCase()
  let count = 0
  let at = haystack.indexOf(VEVENT_OPEN)
  while (at !== -1) {
    count += 1
    at = haystack.indexOf(VEVENT_OPEN, at + VEVENT_OPEN.length)
  }
  return count
}

/**
 * A conservative key for "these two rows point at the same feed".
 *
 * ── WHY IT IS CONSERVATIVE ─────────────────────────────────────────────────
 *
 * Deduplication that is too clever collapses feeds that are genuinely
 * different and silently drops a user's calendar. So this normalises ONLY what
 * is unambiguously insignificant:
 *
 *   • the fragment, which is never sent to a server at all;
 *   • the default port for the scheme (`https://h:443/x` === `https://h/x`);
 *   • the hostname's case, which DNS defines as case-insensitive.
 *
 * Everything that can change what comes back is preserved and therefore
 * distinguishes: protocol, credentials, path, query (including parameter order
 * and duplicate keys — a provider may treat those as meaningful), and any
 * non-default port.
 *
 * Returns null when the URL is unusable, so the caller reports it rather than
 * grouping every broken row under one key.
 */
export function calendarUrlKey(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  // Strip only the fragment and a redundant default port.
  url.hash = ''
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = ''
  }
  return url.toString()
}

/**
 * Run `worker` over `items` with at most `limit` in flight.
 *
 * A fixed pool of `limit` runners pulling from a shared cursor, NOT
 * `Promise.all` over everything and not chunked batches. `Promise.all` starts
 * every request at once, which is the fan-out being prevented; batching stalls
 * on the slowest member of each batch, so one hostile slow source would idle
 * the other two runners for the full per-source timeout.
 *
 * Results land at their ORIGINAL index, so completion order never reorders the
 * response.
 *
 * `worker` must not throw: a rejection here would abandon the remaining items.
 * Callers classify their own failures into a result value.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}
