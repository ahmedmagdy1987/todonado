/**
 * Types for scripts/supabaseTarget.js.
 *
 * The module is plain ESM because it is imported by places that are not
 * TypeScript at all — the CI guard script, vitest's globalSetup, a dev
 * screenshot script — and duplicating it as .ts would mean two copies of the
 * one rule that decides which Supabase a test may touch. `src/` IS type-checked
 * (tsconfig.app.json), so the unit test that pins the guard needs this file.
 */
export declare const HOSTED_SUPABASE_MARKER: string

export declare class HostedSupabaseError extends Error {}

export declare function assertLocalSupabaseUrl(
  url: string | undefined | null,
  context?: string,
): string

export declare function resolveSupabaseTarget(): { url: string; anonKey: string }

export declare function findHostedSupabaseEnv(
  env?: Record<string, string | undefined>,
): { name: string; host: string }[]
