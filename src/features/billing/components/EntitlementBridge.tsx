import { useEffect } from 'react'
import { useEntitlements } from '../useEntitlements'
import { publishEntitlements } from '../entitlementBridge'

/**
 * Publishes the resolved entitlement for non-React readers. Renders nothing.
 *
 * Mounted once, inside `AuthProvider` (it needs the session) and above the
 * routes, so the global mutation-error handler can tell a Free ceiling from
 * entitlement drift no matter which page raised the mutation.
 *
 * The cleanup returned by `publishEntitlements` runs on sign-out and unmount,
 * which is what stops one account's resolved plan being read while the next
 * account is still loading.
 */
export function EntitlementBridge(): null {
  const { status, plan } = useEntitlements()
  useEffect(() => publishEntitlements({ status, plan }), [status, plan])
  return null
}
