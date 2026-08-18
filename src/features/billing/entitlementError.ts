import { ALL_LIMITS, type LimitKey } from './entitlements'

/**
 * THE ONE PLACE A SERVER REJECTION BECOMES A COMMERCIAL FACT.
 *
 * ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
 *
 * `20260818120000_free_count_limits.sql` installs a BEFORE INSERT trigger on the
 * four count-limited tables. When a Free account is already at its ceiling the
 * trigger refuses the row with a message it deliberately made machine-readable:
 *
 *     free_limit_reached:<feature>:<cap>
 *
 * Everything below exists so that string is read in exactly one place. Before
 * this file nothing read it at all, so hitting the ceiling produced "Something
 * went wrong saving your changes" — which is both useless and, worse, untrue in
 * a way that invites the user to think their data is broken.
 *
 * ── WHY THE PREFIX AND NOT THE SQLSTATE ────────────────────────────────────
 *
 * The trigger raises with `errcode = 'check_violation'` (23514), and so do the
 * pre-existing size/shape CHECKs on these same four tables. The code therefore
 * cannot distinguish "you are out of mind maps" from "that title is too long".
 * The migration says as much in its own header and nominates the message prefix
 * as the contract, so the prefix is what this keys on. `sqlLimitContract.test.ts`
 * pins the SQL side of that contract; the tests beside this file pin this side.
 *
 * ── UNKNOWN MUST STAY UNKNOWN ──────────────────────────────────────────────
 *
 * This returns `null` for everything it does not positively recognise, and the
 * caller falls back to the ordinary error path. That is the whole safety
 * property, and it is why the parser is strict to the point of fussiness:
 *
 *   - the message must BEGIN with the prefix, so an unrelated error that merely
 *     quotes it (a log line, a wrapped message, a network error carrying a
 *     server body) cannot be turned into a sales pitch;
 *   - the feature must be a `LimitKey` this build actually knows;
 *   - the cap must be a plain non-negative integer.
 *
 * A future migration that caps a fifth table will parse as `null` here until
 * that table's key is added to the entitlement contract, and `null` degrades to
 * the normal error toast. A wrong-but-friendly upgrade prompt would be worse
 * than a generic error, because it would tell someone to pay for something that
 * would not have helped.
 *
 * It is also why nothing here inspects `details`, matches loosely, or falls back
 * to a substring search: every one of those turns an arbitrary database or
 * network failure into an upsell, which is the exact failure mode this is meant
 * to prevent.
 */

/** The fixed marker the trigger puts at the head of its message. */
export const FREE_LIMIT_ERROR_PREFIX = 'free_limit_reached'

export interface FreeLimitReached {
  type: 'free_limit_reached'
  /** Which ceiling. Always a key the client's entitlement table knows. */
  feature: LimitKey
  /**
   * The cap AS THE SERVER STATED IT.
   *
   * Kept because it is evidence, not because it is what gets rendered. The UI
   * shows `getLimit(plan, feature)` from the entitlement contract — see §6 of
   * the brief and `freeLimitUpgrade.test.ts`. The two are held equal by
   * `sqlLimitContract.test.ts`, which reads the caps straight out of the
   * migration; if they ever diverge, this field is what makes the divergence
   * visible in a diagnostic rather than silently rendering the wrong number.
   */
  cap: number
}

/** Anchored: prefix, feature, cap, and nothing else. */
const FREE_LIMIT_PATTERN = new RegExp(`^${FREE_LIMIT_ERROR_PREFIX}:([a-zA-Z]+):(\\d+)$`)

/**
 * Pull the message out of whatever the caller was handed.
 *
 * TanStack's `onError` is typed `unknown`, and what actually arrives is a
 * `PostgrestError` (a plain object with `message`), an `Error`, or — when the
 * network failed before any of this — something else entirely. Only a string
 * `message` is considered; nothing is coerced, because `String(error)` on a
 * random object produces "[object Object]" and on a thrown string produces the
 * string itself, both of which widen the surface for no benefit.
 */
function messageOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : null
}

/**
 * Recognise a structured entitlement rejection, or return `null`.
 *
 * `null` means "not a commercial limit" and MUST be treated as an ordinary
 * failure — a real database error, a permission error and a dropped connection
 * all land here and must keep reaching the user as errors.
 */
export function parseEntitlementError(error: unknown): FreeLimitReached | null {
  const message = messageOf(error)
  if (message === null) return null

  const match = FREE_LIMIT_PATTERN.exec(message)
  if (!match) return null

  const [, feature, rawCap] = match
  // A key this build does not know is not a limit this build can explain.
  if (!(ALL_LIMITS as readonly string[]).includes(feature)) return null

  const cap = Number(rawCap)
  if (!Number.isSafeInteger(cap) || cap < 0) return null

  return { type: 'free_limit_reached', feature: feature as LimitKey, cap }
}
