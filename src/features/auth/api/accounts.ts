import { supabase } from '@/lib/supabase'

/**
 * Account RPC wrappers (defined in 20260616120000_accounts_username.sql).
 *
 * Login is EMAIL-ONLY — there is no username→email lookup on the client (the
 * `resolve_login_email` RPC was an anon username→email enumeration vector and was
 * dropped in 20260622150000_drop_resolve_login_email.sql). Usernames remain a
 * profile display identity; `username_available` returns a boolean only (no PII)
 * and powers the signup/settings availability hint.
 *
 * This wrapper tolerates the RPC being missing (e.g. the migration is not applied
 * yet): it returns a safe "unknown" value so the availability check just goes
 * quiet rather than blocking signup.
 */

/** true = available, false = taken, null = unknown (RPC unavailable/errored). */
export async function checkUsernameAvailable(username: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('username_available', { uname: username })
  if (error) return null
  return data === true
}
