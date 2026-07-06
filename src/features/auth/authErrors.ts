/**
 * Pure auth-error classifiers (no I/O — unit-tested).
 */

/** The minimal shape of a Supabase AuthError we branch on. */
export interface AuthErrorLike {
  code?: string | null
  message?: string | null
}

/**
 * True for the GoTrue error returned when a magic-link request
 * (`signInWithOtp` with `shouldCreateUser: false`) targets an email that has
 * NO account. We swallow this into the SAME neutral "if an account exists, a
 * link is on its way" confirmation so the magic-link button can never be used
 * to probe whether an address is registered (non-enumerating).
 */
export function isNoAccountOtpError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'otp_disabled') return true
  return /signups?\s+not\s+allowed|otp[_\s-]?disabled/i.test(error.message ?? '')
}

/**
 * True for the GoTrue error returned when a password-reset request
 * (`resetPasswordForEmail`) targets an email that has NO account. Current
 * GoTrue answers 200 for unknown emails (already non-enumerating), but older
 * builds / some configs answer `user_not_found` — swallow that into the SAME
 * neutral "if an account exists, a link is on its way" confirmation so the
 * reset form can never be used to probe whether an address is registered.
 * Real errors (rate limit, network) must still surface.
 */
export function isNoAccountResetError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'user_not_found') return true
  return /user\s+not\s+found/i.test(error.message ?? '')
}

/**
 * True for GoTrue's PER-EMAIL send-frequency limit — the 429 returned when the
 * SAME email requested a reset/magic-link again within the cooldown window
 * (default 60s). Because this check runs AFTER the user lookup, it can ONLY fire
 * for an email that HAS an account — so surfacing it verbatim ("you can only
 * request this after N seconds") turns the flow into an account-existence oracle.
 * We swallow it into the same neutral confirmation (the email simply isn't
 * re-sent). Deliberately NARROW: it must NOT match the IP-based
 * `over_request_rate_limit`, which fires for any caller regardless of account
 * existence and is fine (useful, even) to surface to a legitimate user.
 */
export function isEmailRateLimitError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'over_email_send_rate_limit') return true
  return /for security purposes|only request this after/i.test(error.message ?? '')
}
