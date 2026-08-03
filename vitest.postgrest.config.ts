import { defineConfig } from 'vitest/config'

/**
 * PostgREST permission smoke against a LOCAL Supabase stack.
 *
 * Separate from the raw-Postgres project because it needs GoTrue and PostgREST
 * running, not just a database. Single fork: the tests sign real users in and
 * contend on the same rows.
 */
export default defineConfig({
  test: {
    include: ['db-tests/**/*.postgrest.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
