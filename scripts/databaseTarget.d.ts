/**
 * Types for scripts/databaseTarget.js.
 *
 * Same reasoning as supabaseTarget.d.ts: the module is plain ESM because it is
 * imported by places that are not TypeScript at all (supabase/test/apply.mjs
 * runs as a node script), and duplicating it as .ts would mean two copies of
 * the one rule that decides which Postgres a destructive suite may touch.
 * `db-tests/` and the unit test that pins the guard are TypeScript, so they
 * need this file.
 */
export declare const HOSTED_SUPABASE_MARKER: string

export declare const ALLOWED_SERVICE_HOSTS: Set<string>

export declare class DatabaseTargetError extends Error {}

export declare function redactDatabaseUrl(value: string): string

export declare function assertDisposableDatabaseUrl(
  url: string | undefined | null,
  context?: string,
): string

export declare function resolveDatabaseUrl(context?: string): string
