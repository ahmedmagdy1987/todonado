import Stripe from 'stripe'

/**
 * Stripe server client. No pinned apiVersion — we use the SDK/account default so
 * there is no brittle version string to keep in sync. Instantiated per request
 * from the (server-only) secret key.
 */
export function getStripe(secretKey: string): Stripe {
  return new Stripe(secretKey)
}
