import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client (SERVER ONLY). Bypasses RLS — used exclusively by
 * the webhook to write the `billing` row. Never expose this key to the client.
 */
export function getSupabaseAdmin(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Verify a Supabase access token (from `Authorization: Bearer <jwt>`) and return
 * the authenticated user, or null. Uses the service-role client purely to call
 * the auth server — `getUser(jwt)` validates the token itself.
 */
export async function getUserFromAuthHeader(
  authHeader: string | null,
  url: string,
  serviceRoleKey: string,
): Promise<{ id: string; email: string | null } | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const client = getSupabaseAdmin(url, serviceRoleKey)
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}
