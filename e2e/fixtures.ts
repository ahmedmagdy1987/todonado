import { expect, type Page } from '@playwright/test'

/**
 * Shared E2E fixtures for the specs added after `smoke.spec.ts`.
 *
 * `smoke.spec.ts` is deliberately left alone — it is the proven fresh-user
 * journey and grew its own module-scoped helpers. Rather than refactor a working
 * suite, every NEW spec imports the same techniques from here:
 *
 *  - a unique throwaway identity per run,
 *  - REST seeding with the user's OWN session (so RLS applies normally and the
 *    fixture is deterministic — the UI has no way to backdate anything),
 *  - self-deletion via the `delete_own_account` RPC, plus a per-file safety net
 *    so a failed test never leaves an account behind.
 *
 * NO SECRETS. The Supabase URL and the anon key already ship inside the client
 * bundle (RLS-protected), which is why this suite needs no CI secret at all.
 */

export const SUPABASE_URL = 'https://lplsbfduankkpglyusjp.supabase.co'
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwbHNiZmR1YW5ra3BnbHl1c2pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDkzMzksImV4cCI6MjA5NTkyNTMzOX0.lVX3cKJWiQYlUWGUE35sui45NKgVLWhBBX4ju-o5_OY'

/**
 * `fetch`, but a transient CONNECT failure is retried instead of failing a test.
 *
 * These calls are infrastructure, not assertions: seeding a row, probing whether
 * a migration has been applied, deleting an account afterwards. When one of them
 * dies with `ConnectTimeoutError` the report says a feature is broken, which is
 * simply false — and it wastes the reader's time on a red suite that means
 * nothing. The suite doubled in size across the 2026-07-31 session, and three
 * separate specs failed that way in one run, each on its very first request.
 *
 * ONLY NETWORK-LEVEL FAILURES ARE RETRIED. An HTTP response of any status is
 * returned untouched, so a 404 still means "the migration is not applied" and a
 * 401 still means the token is wrong. Retrying those would hide real failures,
 * which is the trap this kind of helper usually falls into.
 */
async function fetchWithRetry(url: string, init?: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(url, init)
    } catch (e) {
      lastError = e
      // 400ms, then 1200ms. Long enough for a blip, short enough not to matter.
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * 3 ** i))
    }
  }
  throw lastError
}

/** A unique throwaway identity per run (timestamp + random suffix). */
export function uniqueIdentity() {
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return {
    email: `e2e+${stamp}${rand}@example.com`,
    username: `e2e_${stamp}`, // ^[A-Za-z0-9_]{3,30}$
    password: `E2e!smoke-${stamp}`,
  }
}

/** PostgREST call carrying a user's own JWT — RLS applies exactly as in the app. */
export async function rest(
  path: string,
  token: string,
  init: { method?: string; body?: unknown; prefer?: string } = {},
) {
  const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`REST ${path} → ${res.status} ${text}`)
  return text ? (JSON.parse(text) as unknown) : null
}

/**
 * Does a table exist for an ANONYMOUS caller?
 *
 * A missing table is a 404 from PostgREST. A table that EXISTS but denies anon
 * (which every owner-only table does) answers 200 with `[]` — RLS filtering, not
 * a schema error. So `status !== 404` is exactly "the migration has been
 * applied", and it needs no session.
 *
 * Specs use this to skip until `supabase db push` has run, then exercise the
 * real flow with no further changes. The skip is a deploy gate, not an excuse.
 */
export async function tableExists(table: string): Promise<boolean> {
  const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  })
  return res.status !== 404
}

export interface TestAccount {
  userId: string
  email: string
  password: string
  token: string
  workspaceId: string
}

/** Accounts created this file-run, for the afterAll safety net. */
const pending = new Map<string, { email: string; password: string }>()

/**
 * Sign up a throwaway account over the auth REST API and put it straight past
 * first-run onboarding, so a spec lands on the app rather than in the activation
 * flow. `capacityMinutes` sets the daily capacity in the same PATCH.
 */
export async function createTestAccount(
  label: string,
  capacityMinutes = 360,
): Promise<TestAccount> {
  const id = uniqueIdentity()
  const signUp = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: id.email, password: id.password }),
  })
  expect(signUp.ok, `signup for the ${label} fixture`).toBeTruthy()
  const auth = (await signUp.json()) as { access_token: string; user: { id: string } }

  // Recorded BEFORE anything else can fail, so the safety net always owns it.
  pending.set(auth.user.id, { email: id.email, password: id.password })

  await rest(`profiles?id=eq.${auth.user.id}`, auth.access_token, {
    method: 'PATCH',
    body: { onboarding_completed: true, daily_capacity_minutes: capacityMinutes },
  })
  const workspaces = (await rest('workspaces?select=id', auth.access_token)) as { id: string }[]
  expect(workspaces.length, `${label} fixture has a default workspace`).toBeGreaterThan(0)

  return {
    userId: auth.user.id,
    email: id.email,
    password: id.password,
    token: auth.access_token,
    workspaceId: workspaces[0].id,
  }
}

/** Delete a throwaway account (and everything it cascades to). Fails loudly. */
export async function deleteTestAccount(account: TestAccount, label: string): Promise<void> {
  const del = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/rpc/delete_own_account`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${account.token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  expect(del.ok, `${label} fixture cleanup failed: ${del.status}`).toBeTruthy()
  pending.delete(account.userId)
}

/**
 * Per-file safety net. Call from `test.afterAll`. Re-signs in with the account's
 * own credentials and self-deletes, so a test that failed mid-way still leaves
 * the cloud DB clean. A cleanup failure throws — silence here would let runs
 * accumulate accounts forever.
 */
export async function cleanupLeftoverAccounts(): Promise<void> {
  const failures: string[] = []
  for (const [userId, creds] of pending) {
    const signIn = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    })
    if (!signIn.ok) {
      pending.delete(userId) // already gone (or never fully created)
      continue
    }
    const { access_token: token } = (await signIn.json()) as { access_token: string }
    const del = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/rpc/delete_own_account`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    if (!del.ok) failures.push(`${creds.email}: HTTP ${del.status} ${await del.text()}`)
    pending.delete(userId)
  }
  if (failures.length) {
    throw new Error(`E2E cleanup FAILED to delete:\n${failures.join('\n')}`)
  }
}

/** Sign in through the real UI and wait for Today to render. */
export async function signIn(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).last().click()
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible({
    timeout: 30_000,
  })
}

/**
 * Assert the page does not scroll sideways at the given width — the repo's
 * "mobile 390px" rule, checked rather than assumed. A tolerance of 1px absorbs
 * sub-pixel layout rounding.
 */
export async function expectNoHorizontalOverflow(page: Page, width = 390): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, `page scrolls horizontally at ${width}px`).toBeLessThanOrEqual(1)
}
