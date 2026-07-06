import { supabase } from '@/lib/supabase'

/**
 * Client → serverless billing calls. Checkout is a REDIRECT (Stripe-hosted
 * page), so no Stripe.js and no card UI ship in the client bundle — we just POST
 * with the user's access token and follow the returned URL.
 */
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
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
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
