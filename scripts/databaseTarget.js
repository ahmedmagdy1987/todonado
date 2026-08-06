/**
 * THE ONE PLACE THAT DECIDES WHICH POSTGRES THE TESTS ARE ALLOWED TO TOUCH.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * `db-tests/helpers.ts` read `process.env.DATABASE_URL` and handed it straight
 * to `new pg.Client(...)` with NO check of any kind, and `resetBillingState`
 * then issues an unconditional
 *
 *     delete from public.checkout_attempts
 *     delete from public.billing
 *
 * So a developer who happened to have a production connection string exported
 * in their shell — for a psql session, a one-off script, anything — and then ran
 * the documented `npm run test:db` would have silently deleted every billing and
 * checkout row in production. There is no client write path to `billing`, so
 * there is no way back: every paying customer would quietly become Free.
 *
 * Every OTHER suite in this repo already refuses a non-local target
 * (`scripts/supabaseTarget.js`, and `refuseHostedHost` in
 * `supabase/test/apply.mjs`). The database suite — the only one that runs
 * unqualified DELETEs — was the one without a guard.
 *
 * ── WHY IT IS NOT A SUBSTRING TEST ─────────────────────────────────────────
 *
 * The pre-existing refusal was `/supabase\.co/.test(url)`. That is a deny-list,
 * and a deny-list on a destructive operation is the wrong shape: it happily
 * accepts an AWS RDS endpoint, a Neon or Fly host, a bare public IP, a
 * colleague's machine, or a tunnel. It also reads the WHOLE STRING, so a
 * password or a database name containing the marker decides the answer.
 *
 * This is an ALLOW-LIST over the PARSED hostname. Anything not provably a local,
 * disposable target is refused, and the refusal happens before a socket is
 * opened, before a transaction is begun, and before any DELETE, TRUNCATE, DROP,
 * migration, reset or seed runs.
 *
 * ── WHAT IS ALLOWED ────────────────────────────────────────────────────────
 *
 *  • `localhost`
 *  • any IPv4 in 127.0.0.0/8 (so 127.0.0.1 and the odd 127.0.0.2 both work)
 *  • the IPv6 loopback `::1`, with or without brackets
 *  • a short list of DOCUMENTED single-label Docker/Compose service names
 *
 * The service names earn their place because CI and the documented local
 * recipe both run Postgres in a container, where the host is a link name rather
 * than an address. They are safe to allow for a structural reason, not a
 * hopeful one: a single-label name has no dot, so it cannot be a public DNS
 * name — it can only resolve through a container network or /etc/hosts.
 *
 * Everything else is refused, INCLUDING private ranges like 10.x and
 * 192.168.x. "Somewhere on my LAN" is not a disposable database, and a
 * shared staging box is exactly the sort of thing that would be wiped.
 */

/** Kept for the message CI's negative control greps for. */
export const HOSTED_SUPABASE_MARKER = 'supabase.co'

/**
 * Single-label container names that may host a disposable Postgres.
 *
 * Deliberately short. Add to it only with a comment saying which compose file
 * or workflow needs the name, because every entry widens a destructive gate.
 */
export const ALLOWED_SERVICE_HOSTS = new Set([
  'postgres', // the conventional service name in docker-compose / GH Actions services
  'db', // supabase/docker's Postgres service
  'database',
  'supabase-db',
])

export class DatabaseTargetError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DatabaseTargetError'
  }
}

/** Never echo a connection string: it carries a password. Host and port only. */
export function redactDatabaseUrl(value) {
  try {
    const u = new URL(value)
    return u.port ? `${u.hostname}:${u.port}` : u.hostname
  } catch {
    return '<unparseable>'
  }
}

/** True for 127.0.0.0/8 — the whole IPv4 loopback block, not just 127.0.0.1. */
function isIpv4Loopback(hostname) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!m) return false
  const octets = m.slice(1).map(Number)
  if (octets.some((o) => o > 255)) return false
  return octets[0] === 127
}

/** True for the IPv6 loopback in any of its spellings. */
function isIpv6Loopback(hostname) {
  const bare = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
  return bare === '::1' || bare === '0:0:0:0:0:0:0:1'
}

/** Any IP literal at all, so a non-loopback one can be named as such. */
function isIpLiteral(hostname) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true
  return hostname.includes(':') || /^\[.*\]$/.test(hostname)
}

/**
 * Throw unless `url` is a Postgres connection string pointing at a clearly
 * local, disposable database.
 *
 * @param {string | undefined | null} url
 * @param {string} context  where the value came from, for the error message
 * @returns {string} the same url, so call sites can inline it
 */
export function assertDisposableDatabaseUrl(url, context = 'DATABASE_URL') {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new DatabaseTargetError(
      `${context} is not set.\n\n` +
        'The database suite runs unqualified DELETEs (see resetBillingState) against a\n' +
        'DISPOSABLE Postgres, and there is deliberately no default: an unset variable\n' +
        'must never be able to mean "whatever is lying around".\n\n' +
        '  DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db\n',
    )
  }

  /*
   * The hosted-Supabase case is checked FIRST and by substring, on purpose.
   * It is the single most likely mistake, it deserves the clearest wording,
   * and the CI negative control greps for this exact sentence. Everything
   * below is the real allow-list; this is the signpost in front of it.
   */
  if (url.includes(HOSTED_SUPABASE_MARKER)) {
    throw new DatabaseTargetError(
      `REFUSING to run against a supabase.co host — disposable databases only.\n\n` +
        `${context} points at ${redactDatabaseUrl(url)}.\n` +
        'This suite deletes every row in public.billing and public.checkout_attempts.\n' +
        'Refusing before any connection is opened.',
    )
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new DatabaseTargetError(
      `${context} is not a valid connection URL. Refusing before any connection is opened.`,
    )
  }

  // A Postgres URL, not an http(s) endpoint someone pasted by mistake.
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new DatabaseTargetError(
      `${context} has protocol "${parsed.protocol}", expected postgres: or postgresql:.\n` +
        'Refusing before any connection is opened.',
    )
  }

  const hostname = parsed.hostname
  if (!hostname) {
    throw new DatabaseTargetError(
      `${context} has no host. Refusing before any connection is opened.`,
    )
  }

  if (hostname === 'localhost' || isIpv4Loopback(hostname) || isIpv6Loopback(hostname)) {
    return url
  }

  if (ALLOWED_SERVICE_HOSTS.has(hostname.toLowerCase()) && !hostname.includes('.')) {
    return url
  }

  /*
   * Everything past this point is a refusal. The two branches differ only in
   * wording, because "10.0.0.5 is not loopback" and "db.example.com is not
   * local" are different mistakes and the message should say which was made.
   */
  const why = isIpLiteral(hostname)
    ? `${hostname} is not a loopback address. Private and public IPs are both refused: ` +
      'a shared box on a LAN is not a disposable database.'
    : `${hostname} is not a local host. Only localhost, 127.0.0.0/8, ::1 and the ` +
      `documented container names (${[...ALLOWED_SERVICE_HOSTS].join(', ')}) are allowed.`

  throw new DatabaseTargetError(
    `${context} points at ${redactDatabaseUrl(url)}, which is refused.\n\n` +
      `${why}\n\n` +
      'This suite runs `delete from public.billing` and `delete from public.checkout_attempts`\n' +
      'with no WHERE clause. Refusing before any connection is opened.',
  )
}

/**
 * Read and validate the target in one step.
 * @returns {string} a validated connection string
 */
export function resolveDatabaseUrl(context = 'DATABASE_URL') {
  return assertDisposableDatabaseUrl(process.env.DATABASE_URL, context)
}
