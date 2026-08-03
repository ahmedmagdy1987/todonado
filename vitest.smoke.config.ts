import { defineConfig } from 'vitest/config'

/**
 * FRESH-PROJECT FUNCTIONAL SMOKE against a LOCAL Supabase stack.
 *
 * Separate from vitest.postgrest.config.ts on purpose. That suite proves the
 * money path's PERMISSION BOUNDARY and its count gate is a security assertion;
 * this one proves the application WORKS on a database built only from the
 * migrations. Conflating them would make one number mean two things, and the
 * first time a feature test was added the security gate would move with it.
 *
 * Single fork: real users, real rows, shared tables.
 */
export default defineConfig({
  test: {
    include: ['db-tests/**/*.smoke.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
