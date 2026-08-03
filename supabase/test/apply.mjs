#!/usr/bin/env node
/**
 * Apply the shim + the ENTIRE migration chain to a disposable database.
 *
 * Every file in supabase/migrations, in chronological order, from empty. Not
 * just the pending ones: a migration that only works when the ones before it
 * were applied by hand is not a migration that works.
 *
 * Usage: DATABASE_URL=postgres://... node supabase/test/apply.mjs [--reset]
 *
 * ALSO IMPORTABLE. db-tests/billingGrant.db.test.ts needs to apply the chain up
 * to a chosen file and stop, so it can show that service_role still cannot read
 * public.billing BEFORE 20260801160000 lands and can immediately after. That
 * proof is only worth anything if it runs the same applier CI runs, so the loop
 * is exported rather than copied — a second implementation would drift and the
 * regression proof would quietly start proving something else.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import pg from 'pg'

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url))
export const SHIM_PATH = fileURLToPath(new URL('./00_supabase_shim.sql', import.meta.url))

/**
 * A disposable database, never a hosted project. Exported because every entry
 * point — the CLI below and the staged test — must make the same refusal, and
 * one of the workflow's negative controls asserts it fires.
 */
export function refuseHostedHost(url) {
  if (/supabase\.co/.test(url)) {
    throw new Error('REFUSING to run against a supabase.co host — disposable databases only.')
  }
}

/**
 * The chain, chronologically. `through` is an inclusive filename prefix: pass
 * '20260801150000' to stop just before the grant migration.
 */
export function migrationFiles(through) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  if (!through) return files
  const last = files.findIndex((f) => f.startsWith(through))
  if (last === -1) throw new Error(`no migration starts with "${through}"`)
  return files.slice(0, last + 1)
}

/** Drop and recreate the three schemas the chain owns. */
export async function resetSchemas(client) {
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    drop schema if exists storage cascade;
    create schema public;
  `)
}

/**
 * Shim + migrations, each in its own transaction exactly as `supabase db push`
 * does. Returns the files applied, in order.
 */
export async function applyChain(client, { through, log = () => {} } = {}) {
  log('== applying shim')
  await client.query(readFileSync(SHIM_PATH, 'utf8'))

  const files = migrationFiles(through)
  log(`== applying ${files.length} migrations in chronological order`)

  for (const file of files) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8')
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('commit')
      log(`   ok   ${file}`)
    } catch (err) {
      await client.query('rollback').catch(() => {})
      throw new Error(`FAIL ${file}\n        ${err.message}`, { cause: err })
    }
  }
  return files
}

/** Apply exactly one migration by filename prefix. */
export async function applyOne(client, prefix) {
  const file = readdirSync(MIGRATIONS_DIR).find(
    (f) => f.startsWith(prefix) && f.endsWith('.sql'),
  )
  if (!file) throw new Error(`no migration starts with "${prefix}"`)
  await client.query('begin')
  try {
    await client.query(readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8'))
    await client.query('commit')
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  }
  return file
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// Guarded so importing this module does not run a migration.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }
  try {
    // A guardrail, not a formality: this applies UNAPPLIED migrations.
    refuseHostedHost(url)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: url })
  await client.connect()

  if (process.argv.includes('--reset')) {
    await resetSchemas(client)
    console.log('== reset: public/auth/storage dropped')
  }

  try {
    const applied = await applyChain(client, { log: (m) => console.log(m) })
    console.log(`== ${applied.length}/${applied.length} applied cleanly`)
  } catch (err) {
    console.error(`   ${err.message}`)
    await client.end()
    process.exit(1)
  }

  await client.end()
}
