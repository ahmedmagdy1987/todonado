import { z } from 'zod'

/**
 * Environment access for Todonado.
 *
 * IMPORTANT: we never hard-throw on missing env at import time — the app
 * must still render the login screen before Supabase keys are supplied
 * (see PRD / acceptance criteria). Instead we expose `isSupabaseConfigured`
 * so the UI can guide the user to fill in `.env`.
 */
/**
 * Built-in defaults so a fresh clone runs and authenticates with NO .env file.
 * These are the PUBLIC Supabase project URL + anon key: the anon key already
 * ships in the client bundle and is protected by row-level security, so it is
 * safe to commit. NEVER put the service_role key here. A real .env still wins —
 * any non-empty VITE_ var below overrides the default.
 */
const DEFAULT_SUPABASE_URL = 'https://lplsbfduankkpglyusjp.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwbHNiZmR1YW5ra3BnbHl1c2pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDkzMzksImV4cCI6MjA5NTkyNTMzOX0.lVX3cKJWiQYlUWGUE35sui45NKgVLWhBBX4ju-o5_OY'

// `||` (not `??`) so a present-but-blank VITE_ var (e.g. `VITE_SUPABASE_URL=` in
// a half-filled .env) also falls back to the default, while any real non-empty
// value overrides it.
const rawEnv = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
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
