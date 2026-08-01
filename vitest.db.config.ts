import { defineConfig } from 'vitest/config'

/**
 * Integration tests against a REAL, DISPOSABLE PostgreSQL.
 *
 * Separate from the default project because these need a database and the unit
 * suite must stay runnable without one. `singleFork` because several tests
 * deliberately contend on the same rows from two connections; running files in
 * parallel would make one suite's contention look like another's deadlock.
 */
export default defineConfig({
  test: {
    include: ['db-tests/**/*.db.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // A deadlock must FAIL, not hang CI.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
