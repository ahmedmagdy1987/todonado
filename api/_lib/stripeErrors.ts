/**
 * Classifying Stripe failures: "gone" versus "I don't know".
 *
 * ── WHY THE DISTINCTION IS THE WHOLE SAFETY PROPERTY ───────────────────────
 *
 * `create-checkout-session.ts` holds a DURABLE one-open-attempt slot per user
 * (see 20260801150000_checkout_attempts.sql). When it recovers an existing
 * attempt it asks Stripe about the session it already issued. If that call
 * fails, the question is not "did it work" but "do we now KNOW the session is
 * gone".
 *
 * It used to treat every failure as proof. A timeout, a 429, a Stripe 5xx or a
 * DNS blip therefore released the slot while the original Checkout Session was
 * still open and still payable, so the next request minted a second payable
 * session and the customer could be charged twice for a subscription the
 * product cannot see, cancel or honour.
 *
 * Holding a slot is recoverable. Double-charging is not. So every ambiguous
 * answer must classify as "unknown", and only an explicit `resource_missing`
 * releases anything.
 *
 * ── WHY IT LIVES IN _lib ──────────────────────────────────────────────────
 *
 * Two reasons. It is shared error-classification rather than handler logic,
 * and — load-bearing — Vercel treats every top-level `api/*.ts` as a serverless
 * FUNCTION, including test files. This project sits at exactly 12, which is the
 * Hobby-plan ceiling, so a 13th file at that level fails the whole deployment.
 * `api/_lib/` is underscore-prefixed and therefore excluded, which is where a
 * helper and its test belong anyway.
 */

/**
 * Did Stripe DEFINITIVELY say this resource does not exist?
 *
 * Only `resource_missing` (or an invalid-request 404, the same statement in an
 * older shape) means gone. Connection failures, rate limits, API 5xx,
 * authentication/configuration errors and shapes we do not recognise all mean
 * UNKNOWN.
 *
 * Matched on the error's own `code`/`type` rather than `instanceof`: this can
 * see an error that crossed a module boundary or came from a test double, and
 * an `instanceof` check that quietly failed would fail OPEN — the exact
 * direction that costs a customer a double charge.
 */
export function isDefinitivelyMissing(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { type?: unknown; code?: unknown; statusCode?: unknown }
  if (e.code === 'resource_missing') return true
  return e.type === 'StripeInvalidRequestError' && e.statusCode === 404
}
