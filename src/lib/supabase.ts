import { createClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from '@/lib/env'

/**
 * Single shared Supabase browser client.
 *
 * If the project is not yet configured (no .env keys), we instantiate the
 * client with harmless placeholders so the app still boots and renders the
 * login screen. Auth/data calls are gated on `isSupabaseConfigured`.
 */
const url = isSupabaseConfigured ? env.VITE_SUPABASE_URL : 'https://placeholder.supabase.co'
const anonKey = isSupabaseConfigured
  ? env.VITE_SUPABASE_ANON_KEY
  : 'placeholder-anon-key-not-configured'

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export { isSupabaseConfigured }
