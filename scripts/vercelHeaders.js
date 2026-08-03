/**
 * The headers Vercel actually applies, read from vercel.json.
 *
 * ONE SOURCE OF TRUTH. vite.config.ts already reads this file so dev and
 * production cannot drift; this module exists so the E2E assertions and the
 * production-like preview server read it too, instead of copying the policy
 * into a test where it would rot the first time vercel.json changed.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'

const CONFIG_PATH = fileURLToPath(new NodeURL('../vercel.json', import.meta.url))

/** @returns {{ key: string, value: string }[]} the catch-all rule's headers */
export function productionHeaders() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  const rule = (config.headers ?? []).find((h) => h.source === '/(.*)')
  if (!rule) throw new Error('vercel.json has no catch-all /(.*) header rule')
  return rule.headers
}

/** The enforcing Content-Security-Policy string, exactly as deployed. */
export function productionCsp() {
  const header = productionHeaders().find((h) => h.key === 'Content-Security-Policy')
  if (!header) throw new Error('vercel.json has no Content-Security-Policy header')
  return header.value
}

/** Parse a policy into { directive: [sources] }. */
export function parseCsp(policy) {
  const out = {}
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) out[name] = sources
  }
  return out
}

/**
 * The Supabase origins the DEPLOYED policy allows to be connected to.
 *
 * Returned so a test can assert the production policy names the production
 * project WITHOUT hardcoding that host in a test file — which would both rot and
 * trip scripts/assert-local-supabase.mjs.
 */
export function cspSupabaseOrigins() {
  return (parseCsp(productionCsp())['connect-src'] ?? []).filter((s) => s.includes('supabase'))
}

/**
 * The same policy, retargeted at a different Supabase origin.
 *
 * THE ONE DELIBERATE DEVIATION in the production-like CSP smoke test, and it is
 * an origin SUBSTITUTION, never a relaxation: every directive, every other
 * source and the ordering are untouched, and `connect-src` keeps exactly as many
 * entries as it had. The deployed policy hardcodes the production Supabase
 * origin because that is what production connects to; a local stack listens on
 * 127.0.0.1, so without this the browser would refuse every API call and the
 * test would be measuring the substitution rather than the app.
 *
 * @param {string} supabaseUrl e.g. http://127.0.0.1:54321
 */
export function cspRetargetedTo(supabaseUrl) {
  const origin = new NodeURL(supabaseUrl).origin
  const ws = origin.replace(/^http/, 'ws')
  const directives = parseCsp(productionCsp())
  directives['connect-src'] = (directives['connect-src'] ?? []).map((source) => {
    if (!source.includes('supabase')) return source
    return source.startsWith('wss://') || source.startsWith('ws://') ? ws : origin
  })
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(' '))
    .join('; ')
}
