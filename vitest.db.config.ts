import { fileURLToPath, URL } from 'node:url'
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
  /*
   * The `@` alias, because a database test may legitimately import from src/.
   * `calendarSourcesGuard.db.test.ts` runs the CLIENT's `CALENDAR_URL_CASES`
   * table against the SQL function, which is the only way a single truth table
   * can hold two implementations of one policy to the same answers.
   */
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['db-tests/**/*.db.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // A deadlock must FAIL, not hang CI.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
