import { z } from 'zod'

/**
 * Environment access for Todonado.
 *
 * IMPORTANT: we never hard-throw on missing env at import time — the app
 * must still render the login screen before Supabase keys are supplied
 * (see PRD / acceptance criteria). Instead we expose `isSupabaseConfigured`
 * so the UI can guide the user to fill in `.env`.
 */
const rawEnv = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL ?? '',
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
}

export const env = rawEnv

export const isSupabaseConfigured = Boolean(
  rawEnv.VITE_SUPABASE_URL && rawEnv.VITE_SUPABASE_ANON_KEY,
)

// When keys ARE present, validate their shape and warn (dev) if malformed.
const configuredSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
})

if (isSupabaseConfigured) {
  const result = configuredSchema.safeParse(rawEnv)
  if (!result.success && import.meta.env.DEV) {
    console.warn(
      '[todonado] Supabase env vars look malformed:',
      result.error.flatten().fieldErrors,
    )
  }
}
