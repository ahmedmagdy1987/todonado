#!/usr/bin/env node
/**
 * GO-LIVE PREFLIGHT — the CLI.
 *
 *   npm run preflight:live
 *   npm run preflight:live -- --inventory-reviewed --cleanup-verified
 *
 * READ-ONLY, and that is enforced by what it is able to do rather than by
 * discipline: it reads four files and `process.env`, and it has no database
 * client, no Stripe client and no network call anywhere in its import graph.
 * It writes nothing, applies nothing, and cannot change a deployment.
 *
 * All judgement lives in scripts/preflightLive.js (pure, unit-tested). This file
 * is only the I/O and the printing, so the rules can be tested without a
 * filesystem and the output can change without touching them.
 *
 * EXIT CODE: 0 when READY FOR LIVE, 1 otherwise. It is deliberately NOT wired
 * into CI — until the manual gates are acknowledged it is *supposed* to answer
 * NOT READY, and a red pipeline on every push would train everyone to ignore it.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'

import { productionCsp } from './vercelHeaders.js'
import {
  MANUAL_GATES,
  checkFunctionBudget,
  checkMigrationChain,
  checkPricing,
  checkStripeCsp,
  checkStripeEnv,
  summarise,
} from './preflightLive.js'

const repoPath = (relative) => fileURLToPath(new NodeURL(relative, import.meta.url))

/** Read the two published prices out of the module that owns them. */
function readPricing() {
  const source = readFileSync(repoPath('../src/features/marketing/pricing.ts'), 'utf8')
  const read = (name) => {
    const match = new RegExp(`export const ${name}\\s*=\\s*(\\d+(?:\\.\\d+)?)`).exec(source)
    return match ? Number(match[1]) : Number.NaN
  }
  return { monthlyUsd: read('PRO_MONTHLY_USD'), yearlyUsd: read('PRO_YEARLY_USD') }
}

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: npm run preflight:live -- [gate flags]\n')
  console.log('Repo checks always run. Each gate below is something no repo-local')
  console.log('check can see; pass its flag only once it is actually true.\n')
  for (const gate of MANUAL_GATES) {
    console.log(`  --${gate.flag}`)
    console.log(`      ${gate.title}`)
    console.log(`      ${gate.detail}\n`)
  }
  process.exit(0)
}

const knownFlags = new Set(MANUAL_GATES.map((g) => g.flag))
const acknowledged = args
  .filter((a) => a.startsWith('--'))
  .map((a) => a.slice(2))
  .filter((flag) => knownFlags.has(flag))

const unknown = args
  .filter((a) => a.startsWith('--'))
  .map((a) => a.slice(2))
  .filter((flag) => !knownFlags.has(flag))

if (unknown.length > 0) {
  // Fail loudly. A typo'd gate flag would otherwise silently NOT be
  // acknowledged, which is the safe direction, but it would also be blamed on
  // the check rather than on the typo.
  console.error(`Unknown flag(s): ${unknown.map((f) => `--${f}`).join(', ')}`)
  console.error('Run with --help to see the gate flags.')
  process.exit(2)
}

const checks = [
  checkMigrationChain(readdirSync(repoPath('../supabase/migrations'))),
  checkFunctionBudget(readdirSync(repoPath('../api'), { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)),
  checkStripeCsp(productionCsp()),
  checkPricing(readPricing()),
  checkStripeEnv(process.env),
]

const icon = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' }

console.log('\nTodonado — Stripe go-live preflight (read-only)\n')
console.log('Repo checks')
console.log('-'.repeat(72))
for (const check of checks) {
  console.log(`  [${icon[check.status]}] ${check.title}`)
  console.log(`         ${check.detail}`)
}

const summary = summarise(checks, acknowledged)

console.log('\nManual gates')
console.log('-'.repeat(72))
for (const gate of MANUAL_GATES) {
  const done = acknowledged.includes(gate.flag)
  console.log(`  [${done ? ' OK ' : 'TODO'}] ${gate.title}`)
  if (!done) console.log(`         ${gate.detail}`)
}

console.log('\n' + '='.repeat(72))
console.log(summary.verdict)
console.log('='.repeat(72))

if (summary.reasons.length > 0) {
  console.log('\nWhy:')
  for (const reason of summary.reasons) console.log(`  - ${reason}`)
}
if (summary.skipped.length > 0) {
  console.log('\nNot evaluated here (does not block):')
  for (const check of summary.skipped) console.log(`  - ${check.title}: ${check.detail}`)
}
console.log('')

process.exit(summary.ready ? 0 : 1)
