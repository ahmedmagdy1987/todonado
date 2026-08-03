import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * THE SERVICE-ROLE KEY IS SERVER-ONLY, AND THE INTERNAL RPCs HAVE EXACTLY TWO
 * CALLERS.
 *
 * The database now refuses anon and authenticated outright, so this is the
 * second half of the same boundary: nothing may leak the key into the browser
 * bundle, and no new caller may quietly start invoking the privileged functions
 * from somewhere that is not a server handler.
 *
 * A static test because the failure it prevents is a diff, not a runtime state.
 */

const root = fileURLToPath(new URL('../..', import.meta.url))

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
    const full = `${dir}/${entry}`
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const SRC = walk(`${root}/src`)
const API = walk(`${root}/api`)
const isTest = (f: string) => /\.test\.tsx?$/.test(f) || f.includes('/src/test/')

/** The five privileged functions. Only server handlers may name them. */
const INTERNAL_RPCS = [
  'reserve_checkout_attempt',
  'mark_checkout_attempt',
  'bind_verified_checkout',
  'apply_stripe_billing_event',
  'apply_stripe_subscription_event',
]

describe('the service-role key never reaches the browser', () => {
  it('is read in exactly one place, and that place is server-side', () => {
    const readers = [...SRC, ...API]
      .filter((f) => !isTest(f))
      .filter((f) => /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(root.length + 1))

    expect(readers).toEqual(['api/_lib/config.ts'])
  })

  it('no src/ module outside tests reads it at all', () => {
    // Anything under src/ can end up in the client bundle. `api/` cannot.
    const leaks = SRC.filter((f) => !isTest(f))
      .filter((f) => /SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(root.length + 1))

    expect(leaks).toEqual([])
  })

  it('no VITE_-prefixed variable carries a service role or secret key', () => {
    // A VITE_ variable is inlined into the bundle at build time. Naming one
    // after the service role would publish it.
    const offenders: string[] = []
    for (const f of [...SRC, ...API]) {
      for (const m of readFileSync(f, 'utf8').matchAll(/VITE_[A-Z0-9_]+/g)) {
        if (/SERVICE|SECRET|PRIVATE|WEBHOOK/.test(m[0])) offenders.push(`${f}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('.env.example never suggests a VITE_ service-role variable', () => {
    const example = readFileSync(`${root}/.env.example`, 'utf8')
    expect(example).not.toMatch(/VITE_[A-Z0-9_]*(SERVICE|SECRET)/)
  })
})

describe('only server handlers invoke the internal RPCs', () => {
  it.each(INTERNAL_RPCS)('%s is named only by api/ handlers', (fn) => {
    const callers = [...SRC, ...API]
      .filter((f) => !isTest(f))
      .filter((f) => readFileSync(f, 'utf8').includes(fn))
      .map((f) => f.slice(root.length + 1))

    for (const caller of callers) {
      expect(
        caller.startsWith('api/'),
        `${fn} is referenced from ${caller}; only server handlers may call it`,
      ).toBe(true)
    }
  })

  it('the full set of callers is exactly the two money-path handlers', () => {
    const callers = new Set<string>()
    for (const f of [...SRC, ...API].filter((x) => !isTest(x))) {
      const text = readFileSync(f, 'utf8')
      if (INTERNAL_RPCS.some((fn) => text.includes(fn))) callers.add(f.slice(root.length + 1))
    }
    expect([...callers].sort()).toEqual([
      'api/create-checkout-session.ts',
      'api/stripe-webhook.ts',
    ])
  })
})

describe('no handler forwards a client token as the service role', () => {
  it('getSupabaseAdmin is only ever given the env key, never a request header', () => {
    // Skip the module that DEFINES it; its signature is not a call site.
    const callSites = API.filter((x) => !isTest(x) && !x.endsWith('_lib/supabase.ts'))
    expect(callSites.length, 'the scan must actually look at something').toBeGreaterThan(0)
    for (const f of callSites) {
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(/getSupabaseAdmin\(([^)]*)\)/g)) {
        const args = m[1].replace(/\s+/g, ' ').trim()
        if (!args) continue
        expect(
          args,
          `${f.slice(root.length + 1)} passes "${args}" to getSupabaseAdmin`,
        ).toBe('env.supabaseUrl, env.supabaseServiceRoleKey')
      }
    }
  })

  it('the authorization header is only ever passed to the JWT verifier', () => {
    for (const f of API.filter((x) => !isTest(x))) {
      const text = readFileSync(f, 'utf8')
      for (const line of text.split('\n')) {
        if (!line.includes("headers.get('authorization')")) continue
        expect(
          line.includes('getUserFromAuthHeader') || /^\s*(req\.headers|\/\/|\*)/.test(line),
          `${f.slice(root.length + 1)}: the auth header must only reach getUserFromAuthHeader`,
        ).toBe(true)
      }
    }
  })
})
