#!/usr/bin/env node
/**
 * Start a disposable PostgreSQL for LOCAL runs.
 *
 * CI uses a postgres service container; this exists so the same tests can be
 * iterated on without Docker. Real PostgreSQL binaries, from
 * @embedded-postgres/linux-x64.
 */
import { rmSync } from 'node:fs'

/*
 * embedded-postgres is INTENTIONALLY not a package.json dependency: it ships
 * ~100 MB of PostgreSQL binaries, and CI does not need them because it uses a
 * postgres service container. Install it on demand for local runs.
 */
let EmbeddedPostgres
try {
  ;({ default: EmbeddedPostgres } = await import('embedded-postgres'))
} catch {
  console.error(
    'embedded-postgres is not installed (deliberately — it is ~100 MB of binaries\n' +
      'and CI uses a service container instead).\n\n' +
      '  npm install --no-save embedded-postgres\n',
  )
  process.exit(1)
}

const dir = process.env.PGTEST_DIR ?? '/tmp/todonado-pgdata'
const port = Number(process.env.PGTEST_PORT ?? 55432)
const fresh = process.argv.includes('--fresh')

if (fresh) rmSync(dir, { recursive: true, force: true })

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
})

if (fresh) await pg.initialise()
await pg.start()
console.log(`postgres://postgres:postgres@localhost:${port}/postgres`)
process.exit(0)
