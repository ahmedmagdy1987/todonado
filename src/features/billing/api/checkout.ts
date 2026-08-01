import { supabase } from '@/lib/supabase'

/**
 * Client → serverless billing calls. Checkout is a REDIRECT (Stripe-hosted
 * page), so no Stripe.js and no card UI ship in the client bundle — we just POST
 * with the user's access token and follow the returned URL.
 */

/**
 * The API answers with stable machine codes (see api/_lib/http.ts). Map them to
 * copy a human can act on — never show the raw code, and never surface a Stripe
 * message verbatim for the config cases.
 */
const ERROR_COPY: Record<string, string> = {
  billing_not_configured:
    'Payments aren’t switched on yet. We’ve been notified, so please try again shortly.',
  unauthorized: 'Your session expired. Please sign in again and retry.',
  missing_price_id: 'That plan is unavailable right now. Please try again shortly.',
  invalid_price: 'That plan is unavailable right now. Please try again shortly.',
  no_subscription: 'You don’t have an active subscription to manage yet.',
  /*
   * Not a failure — the server refused a SECOND subscription (audit FLAG-14),
   * which leaves the user exactly where they wanted to be. The copy points at
   * the portal rather than inviting a retry that would be refused identically.
   */
  already_subscribed:
    'You’re already subscribed. Use “Manage subscription” to change or cancel your plan.',
  billing_schema_outdated: 'Payments are briefly unavailable. Please try again shortly.',
  billing_read_failed: 'We couldn’t load your billing details. Please try again.',
  stripe_error: 'Stripe couldn’t start the checkout. Please try again.',
  billing_lookup_failed: 'We couldn’t load your billing details. Please try again.',
  internal_error: 'Something went wrong on our side. Please try again.',
  method_not_allowed: 'Something went wrong on our side. Please try again.',
}

/** Human-readable message for an API error code (falls back to a safe default). */
export function checkoutErrorMessage(code: string | undefined, status: number): string {
  if (code && ERROR_COPY[code]) return ERROR_COPY[code]
  return `Something went wrong (${status}). Please try again.`
}

async function authedPost(path: string, body: unknown): Promise<{ url?: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok) throw new Error(checkoutErrorMessage(data.error, res.status))
  return data
}

/** Create a Checkout session for `priceId` and redirect the browser to Stripe. */
export async function startCheckout(priceId: string): Promise<void> {
  const { url } = await authedPost('/api/create-checkout-session', { priceId })
  if (!url) throw new Error('No checkout URL returned')
  window.location.href = url
}

/** Open the Stripe Customer Portal (manage / cancel) and redirect the browser. */
export async function openBillingPortal(): Promise<void> {
  const { url } = await authedPost('/api/create-portal-session', {})
  if (!url) throw new Error('No portal URL returned')
  window.location.href = url
}
