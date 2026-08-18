/**
 * A small in-process rate limiter for the serverless endpoints (audit FLAG-10).
 *
 * READ THIS BEFORE TRUSTING IT.
 *
 * WHAT IT ACTUALLY PROTECTS AGAINST:
 *  - one client hammering an endpoint in a loop (a runaway retry, a stuck
 *    useEffect, someone with curl and a for-loop);
 *  - the calendar proxy being driven as an outbound request generator faster
 *    than a human could plausibly need it;
 *  - Stripe API throttling caused by our own traffic, which would break
 *    checkout for real customers at exactly the wrong moment.
 *
 * WHAT IT DOES NOT PROTECT AGAINST, AND WHY:
 *  - A DISTRIBUTED attacker. The counters live in one Node process. Vercel runs
 *    many concurrent instances and recycles them freely, so the effective limit
 *    is `limit × number of live instances`, and it resets whenever an instance
 *    is cold-started. An attacker with a spread of source addresses, or simply
 *    enough concurrency to fan out across instances, is NOT stopped.
 *  - Sustained cost control. See above: the ceiling is not a real ceiling.
 *
 * A limit that actually holds needs shared state — Upstash/Redis, Vercel KV, or
 * a WAF rule at the edge. That is infrastructure, it costs money, and it is a
 * decision for the owner. This module is the honest 80%: it turns the trivial
 * accidents into 429s without pretending to be a security boundary. It is
 * written down here rather than in a commit message because the next person to
 * read this file will otherwise assume the endpoint is protected.
 *
 * IT IS ALSO DELIBERATELY FAIL-OPEN. If the bookkeeping throws, the request is
 * allowed. Refusing paying customers access to checkout because a Map misbehaved
 * would be a worse outcome than the abuse this prevents.
 */

export interface RateLimitDecision {
  allowed: boolean
  /** Seconds until the window rolls over. Only meaningful when blocked. */
  retryAfterSeconds: number
  /** Requests left in the current window. */
  remaining: number
}

interface Window {
  count: number
  /** Epoch ms at which this window expires. */
  resetAt: number
}

export type RateLimitStore = Map<string, Window>

/** Endpoint budgets. Generous — these catch loops, not humans. */
export const LIMITS = {
  /** Creating Stripe sessions. A person clicks Upgrade a handful of times, not 30. */
  billing: { limit: 10, windowMs: 60_000 },
  /**
   * The calendar proxy makes OUTBOUND requests, so it is the tightest. One call
   * syncs ALL of a user's sources, and TanStack Query holds the result, so a
   * legitimate client needs this a handful of times an hour, not a minute.
   */
  calendar: { limit: 6, windowMs: 60_000 },
  /*
   * Minting a signed upload URL for a voice note. A person records a handful of
   * notes a day, not twelve a minute, and each call is a Storage round trip made
   * with the service role, so the budget is tight on purpose. Generous enough
   * that a retry after a dropped connection is never the thing that stops
   * somebody recording.
   */
  journalAudio: { limit: 12, windowMs: 60_000 },
} as const

/**
 * Fixed-window counter. Chosen over a sliding window or token bucket because
 * the whole thing is best-effort anyway (see the header) and a fixed window is
 * the variant whose behaviour is obvious from the outside — a burst at a window
 * boundary can briefly allow up to 2× the limit, which for these budgets is
 * still far below anything that matters.
 *
 * `now` is injected so the tests do not sleep.
 */
export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitDecision {
  const existing = store.get(key)

  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0, remaining: limit - 1 }
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    }
  }

  existing.count += 1
  return { allowed: true, retryAfterSeconds: 0, remaining: limit - existing.count }
}

/**
 * Drop expired windows. Called opportunistically on write so a long-lived
 * instance cannot accumulate a key per user forever — the counters are tiny,
 * but "tiny × unbounded" is still a leak.
 */
export function pruneRateLimitStore(store: RateLimitStore, now: number = Date.now()): void {
  for (const [key, window] of store) {
    if (now >= window.resetAt) store.delete(key)
  }
}

/**
 * The identity a limit is counted against.
 *
 * A VERIFIED USER ID IS PREFERRED OVER AN IP, ALWAYS. An IP is shared by
 * everyone behind a corporate NAT or a mobile carrier, so limiting on it
 * punishes bystanders; and it is trivially rotated by anyone who cares. The
 * user id comes from a verified JWT, so it cannot be spoofed and it names
 * exactly the account responsible.
 *
 * The IP fallback exists only for callers we could not identify. It reads
 * `x-forwarded-for`'s FIRST entry, which on Vercel is the client address the
 * platform observed; the header is attacker-appendable, so this is a
 * best-effort bucket and never an authorisation decision.
 */
export function rateLimitKey(scope: string, userId: string | null, req: Request): string {
  if (userId) return `${scope}:user:${userId}`
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  const ip = forwarded.split(',')[0]?.trim() || 'unknown'
  return `${scope}:ip:${ip}`
}

/** Module-level stores. One per scope so a busy proxy cannot starve checkout. */
const stores: Record<string, RateLimitStore> = {}

/** Best-effort limit check. Never throws — a broken limiter must not break billing. */
export function enforceRateLimit(
  scope: keyof typeof LIMITS,
  userId: string | null,
  req: Request,
): RateLimitDecision {
  try {
    const { limit, windowMs } = LIMITS[scope]
    const store = (stores[scope] ??= new Map())
    const now = Date.now()
    if (store.size > 500) pruneRateLimitStore(store, now)
    return checkRateLimit(store, rateLimitKey(scope, userId, req), limit, windowMs, now)
  } catch {
    return { allowed: true, retryAfterSeconds: 0, remaining: 0 }
  }
}

/** Test-only: forget every counter. */
export function resetRateLimitStores(): void {
  for (const key of Object.keys(stores)) delete stores[key]
}
