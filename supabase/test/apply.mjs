#!/usr/bin/env node
/**
 * Apply the shim + the ENTIRE migration chain to a disposable database.
 *
 * Every file in supabase/migrations, in chronological order, from empty. Not
 * just the two pending ones: a migration that only works when the ones before
 * it were applied by hand is not a migration that works.
 *
 * Usage: DATABASE_URL=postgres://... node supabase/test/apply.mjs [--reset]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}
if (/supabase\.co/.test(url)) {
  // A guardrail, not a formality: this applies UNAPPLIED migrations.
  console.error('REFUSING to run against a supabase.co host — disposable databases only.')
  process.exit(1)
}

const dir = fileURLToPath(new URL('../migrations', import.meta.url))
const shim = fileURLToPath(new URL('./00_supabase_shim.sql', import.meta.url))

const client = new pg.Client({ connectionString: url })
await client.connect()

if (process.argv.includes('--reset')) {
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    drop schema if exists storage cascade;
    create schema public;
  `)
  console.log('== reset: public/auth/storage dropped')
}

console.log('== applying shim')
await client.query(readFileSync(shim, 'utf8'))

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
console.log(`== applying ${files.length} migrations in chronological order`)

let applied = 0
for (const file of files) {
  const sql = readFileSync(`${dir}/${file}`, 'utf8')
  try {
    // Each migration in its own transaction, exactly as `supabase db push` does.
    await client.query('begin')
    await client.query(sql)
    await client.query('commit')
    applied += 1
    console.log(`   ok   ${file}`)
  } catch (err) {
    await client.query('rollback').catch(() => {})
    console.error(`   FAIL ${file}\n        ${err.message}`)
    await client.end()
    process.exit(1)
  }
}

console.log(`== ${applied}/${files.length} applied cleanly`)
await client.end()
