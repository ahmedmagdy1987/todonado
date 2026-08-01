/** Small JSON Response helper for the serverless handlers (Web signature). */
export function json(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  })
}

/**
 * Redact anything that looks like a credential before it can reach a response
 * body or a log line. Third-party error messages (Stripe, Supabase) sometimes
 * echo back the input they were given, so this is defence-in-depth: we return
 * upstream messages to help debugging, but never a key.
 *
 * Covers Stripe secret/restricted/publishable keys (test AND live), Stripe
 * webhook signing secrets, Supabase's `sb_secret_` / `sb_publishable_` format,
 * and JWTs (the Supabase anon + service-role keys are JWTs).
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/\b[rs]k_(?:live|test)_[A-Za-z0-9]+/g, '[redacted-stripe-key]')
    .replace(/\bpk_(?:live|test)_[A-Za-z0-9]+/g, '[redacted-stripe-key]')
    .replace(/\bwhsec_[A-Za-z0-9]+/g, '[redacted-webhook-secret]')
    /*
     * Supabase's newer key format. The audit noted this gap and reasoned it
     * "stops mattering for the response path" once upstream messages were no
     * longer echoed (FLAG-13) — true for RESPONSES, and irrelevant to LOGS,
     * which every error path here still writes and which go to Vercel.
     */
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[redacted-supabase-key]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
}

/** Error codes the billing endpoints can return. Stable, machine-readable. */
export type ApiErrorCode =
  | 'method_not_allowed'
  | 'billing_not_configured'
  | 'unauthorized'
  | 'invalid_price'
  | 'missing_price_id'
  | 'no_subscription'
  // The caller already has a live subscription; a second checkout would create
  // a second one Stripe would happily bill (audit FLAG-14). Send them to the
  // portal instead.
  | 'already_subscribed'
  | 'missing_signature'
  | 'invalid_signature'
  | 'billing_lookup_failed'
  | 'billing_upsert_failed'
  | 'billing_read_failed'
  // The webhook reached the billing row but the event-ordering columns are
  // absent, i.e. 20260801140000_billing_event_ordering.sql has not been applied.
  // It refuses to write rather than falling back to the unordered upsert that
  // caused audit FLAG-3. Stripe retries a 503, so queued events are not lost.
  | 'billing_schema_outdated'
  | 'stripe_error'
  | 'internal_error'
  // Too many requests in the window (audit FLAG-10). Best-effort and
  // per-instance — see api/_lib/rateLimit.ts for exactly what that does and
  // does not stop.
  | 'rate_limited'
  // Calendar proxy (api/calendar-fetch)
  | 'not_configured'
  | 'pro_required'
  | 'calendar_lookup_failed'

export function apiError(
  status: number,
  error: ApiErrorCode,
  extra?: Record<string, unknown>,
): Response {
  return json(status, { error, ...extra })
}

/**
 * Top-level boundary so NOTHING escapes as a naked 500. Any throw that reaches
 * here is logged server-side (redacted) and answered with a stable
 * `{"error":"internal_error"}` — the client never sees a stack trace, and the
 * platform never has to synthesise FUNCTION_INVOCATION_FAILED for us.
 *
 * NOTE: this cannot catch a *module-load* failure (e.g. an extensionless
 * relative import under `"type": "module"`) — that throws before the handler
 * object exists. Those are prevented by type-checking `api/` (tsconfig.api.json)
 * and by the module-load smoke test in api/_lib/moduleLoad.test.ts.
 */
export function withErrorBoundary(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req)
    } catch (err) {
      const message = redactSecrets(err instanceof Error ? err.message : String(err))
      // Server-side only — never returned to the caller.
      console.error('[api] unhandled error:', message)
      return apiError(500, 'internal_error')
    }
  }
}
