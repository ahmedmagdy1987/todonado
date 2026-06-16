import { supabase } from '@/lib/supabase'

/**
 * Account RPC wrappers (defined in 20260616120000_accounts_username.sql).
 *
 * Both tolerate the RPC being missing (e.g. the migration is not applied yet):
 * they return a safe "unknown" value so the UI degrades gracefully — email
 * login still works, and the username availability check just goes quiet rather
 * than blocking signup.
 */

/** true = available, false = taken, null = unknown (RPC unavailable/errored). */
export async function checkUsernameAvailable(username: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('username_available', { uname: username })
  if (error) return null
  return data === true
}

/** The login email for a username (case-insensitive), or null if not found / RPC unavailable. */
export async function resolveLoginEmail(identifier: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('resolve_login_email', { identifier })
  if (error) return null
  return (data as string | null) ?? null
}
