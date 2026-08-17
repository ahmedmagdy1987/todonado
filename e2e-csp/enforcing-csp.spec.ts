import { test, expect, type Page } from '@playwright/test'
import { productionCsp, parseCsp } from '../scripts/vercelHeaders.js'
import { resolveSupabaseTarget } from '../scripts/supabaseTarget.js'

/**
 * THE POLICY THAT ACTUALLY SHIPS, ENFORCING, AGAINST THE BUILT APP.
 *
 * `e2e/smoke.spec.ts` asserts the CSP's VALUE, and `src/test/securityHeaders`
 * asserts that vercel.json ships it enforcing. Neither one has ever run the app
 * under it: the E2E suite drives the Vite dev server, which serves the same
 * policy Report-Only on purpose, so a directive that breaks the product would
 * show up as a console warning nobody fails on.
 *
 * Here the production bundle is served behind the real headers with the real
 * key, and every `securitypolicyviolation` the page raises is collected and
 * asserted empty. A blocked font, a blocked blob, an inline script or an
 * eval() would be a hard failure.
 *
 * See scripts/serve-production-like.mjs for what this does and does not prove
 * relative to a Vercel Preview, and for the single origin substitution in
 * connect-src.
 */

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = resolveSupabaseTarget() as {
  url: string
  anonKey: string
}

interface Violation {
  directive: string
  blockedURI: string
  sample: string
}

declare global {
  interface Window {
    __cspViolations: Violation[]
  }
}

/**
 * Collect violations from the page itself.
 *
 * Chromium also logs them to the console, but the console text is lossy and
 * locale-shaped; the `securitypolicyviolation` event carries the directive and
 * the blocked URI, which is what a failure needs to name.
 */
async function collectViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push({
        directive: e.violatedDirective,
        blockedURI: e.blockedURI,
        sample: e.sample ?? '',
      })
    })
  })
}

const violationsOf = (page: Page) => page.evaluate(() => window.__cspViolations ?? [])

const describeViolations = (v: Violation[]) =>
  v.map((x) => `  ${x.directive} blocked ${x.blockedURI || '(inline)'} ${x.sample}`).join('\n')

test.beforeEach(async ({ page }) => {
  await collectViolations(page)
})

test('the server sends an ENFORCING policy, and it is vercel.json apart from the Supabase origin', async ({
  request,
}) => {
  const res = await request.get('/')
  expect(res.ok()).toBeTruthy()
  const h = res.headers()

  // The key is what makes it enforcing. Report-Only here would make every other
  // assertion in this file meaningless.
  expect(h['content-security-policy'], 'the policy must be ENFORCING').toBeTruthy()
  expect(h['content-security-policy-report-only'], 'never both').toBeFalsy()

  const served = parseCsp(h['content-security-policy'])
  const deployed = parseCsp(productionCsp())

  // Same directives, same count, nothing relaxed. The ONLY permitted difference
  // is which Supabase origin connect-src names.
  expect(Object.keys(served).sort()).toEqual(Object.keys(deployed).sort())
  for (const name of Object.keys(deployed)) {
    if (name === 'connect-src') {
      expect(served[name].length, 'connect-src must not gain or lose sources').toBe(
        deployed[name].length,
      )
      continue
    }
    expect(served[name], `${name} must be byte-identical to the deployed policy`).toEqual(
      deployed[name],
    )
  }

  // The substitution really is a LOCAL origin, not a second hosted project.
  expect(served['connect-src'].some((s) => s.includes(new URL(SUPABASE_URL).host))).toBe(true)

  // The other production headers travel with it.
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(h['permissions-policy']).toContain('microphone=(self)')
})

test('the app boots, styles, fonts and images load, and nothing is blocked', async ({ page }) => {
  const failed: string[] = []
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`))

  await page.goto('/welcome')
  await expect(page.getByRole('button', { name: 'Start free' }).first()).toBeVisible()

  // A rendered brand font proves font-src and style-src actually resolved,
  // rather than the page falling back to a system font under a blocked link.
  const usedFont = await page.evaluate(() => {
    const el = document.querySelector('h1, h2')
    return el ? getComputedStyle(el).fontFamily : ''
  })
  expect(usedFont, 'a heading must resolve a font family').toBeTruthy()

  const v = await violationsOf(page)
  expect(v, `CSP blocked something the landing needs:\n${describeViolations(v)}`).toEqual([])
  expect(failed.join('\n'), 'a required request failed').not.toMatch(/\.(css|js|woff2)/)
})

test('no inline script and no eval — script-src is bare self', async ({ page }) => {
  await page.goto('/welcome')
  await page.waitForLoadState('networkidle')

  const v = await violationsOf(page)
  const scriptViolations = v.filter((x) => x.directive.startsWith('script-src'))
  expect(
    scriptViolations,
    `the bundle depends on inline script or eval, which production forbids:\n${describeViolations(scriptViolations)}`,
  ).toEqual([])

  // And the policy really is that strict, so the assertion above means something.
  const deployed = parseCsp(productionCsp())
  expect(deployed['script-src']).toEqual(["'self'"])
})

test('the manifest and the service worker load under the policy', async ({ page }) => {
  await page.goto('/welcome')

  const manifest = await page.request.get('/manifest.webmanifest')
  expect(manifest.ok(), 'the PWA manifest must be served').toBeTruthy()

  const registered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported'
    const reg = await navigator.serviceWorker.getRegistration()
    return reg ? 'registered' : 'none'
  })
  // script-src 'self' covers a same-origin worker script; a blocked one would
  // show up as a violation rather than as `none`.
  expect(['registered', 'none']).toContain(registered)
  const v = await violationsOf(page)
  expect(
    v.filter((x) => x.blockedURI.includes('sw.js') || x.directive.startsWith('worker-src')),
    'the service worker was blocked by CSP',
  ).toEqual([])
})

test('a Supabase API request is allowed by connect-src, and auth works end to end', async ({
  page,
}) => {
  const email = `csp-${Date.now()}@dbtest.local`
  const password = 'test-password-123!'

  // Create the account out of band so this test measures the BROWSER's ability
  // to talk to Supabase under the policy, not the signup form's validation.
  const signUp = await page.request.post(`${SUPABASE_URL}/auth/v1/signup`, {
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    data: { email, password },
  })
  expect(signUp.ok(), `signup failed: ${signUp.status()}`).toBeTruthy()

  const supabaseCalls: string[] = []
  page.on('request', (r) => {
    if (r.url().startsWith(SUPABASE_URL)) supabaseCalls.push(r.url())
  })

  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).last().click()

  // Reaching the command centre means the auth POST, the session exchange and
  // the first PostgREST reads all completed under `connect-src`.
  await expect(page.getByRole('heading', { name: 'Your Command Center', level: 2 })).toBeVisible({
    timeout: 30_000,
  })

  expect(supabaseCalls.length, 'the app never called Supabase at all').toBeGreaterThan(0)
  const v = await violationsOf(page)
  expect(
    v.filter((x) => x.directive.startsWith('connect-src')),
    `connect-src blocked a Supabase request:\n${describeViolations(v)}`,
  ).toEqual([])
})

test('the password-recovery route renders under the policy', async ({ page }) => {
  // Logged out and with no recovery token this page is its own <h1>; it is
  // outside the app shell, so there is no <h2> here the way there is on an
  // in-app screen.
  await page.goto('/reset-password')
  await expect(page.getByRole('heading', { name: 'Set a new password', level: 1 })).toBeVisible()
  const v = await violationsOf(page)
  expect(v, `CSP blocked something on /reset-password:\n${describeViolations(v)}`).toEqual([])
})

test('generated noise plays from a blob URL — media-src blob: is load-bearing', async ({
  page,
}) => {
  await page.goto('/welcome')

  /*
   * The sleep-noise player encodes generated PCM to a WAV Blob and plays it
   * through an <audio> element (see wellness/audio/wav.ts — a Web Audio graph
   * is suspended when the tab is hidden, so a media element is used instead).
   * Without `media-src blob:` that element is blocked outright, and the whole
   * feature is silent in production while working in dev.
   */
  const result = await page.evaluate(async () => {
    // A minimal valid 8-bit mono WAV, built in the page so the blob really is
    // created by page script under the page's own policy.
    const header = new Uint8Array([
      82, 73, 70, 70, 40, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 64,
      31, 0, 0, 64, 31, 0, 0, 1, 0, 8, 0, 100, 97, 116, 97, 4, 0, 0, 0, 128, 128, 128, 128,
    ])
    const url = URL.createObjectURL(new Blob([header], { type: 'audio/wav' }))
    const el = new Audio()
    el.muted = true
    el.src = url
    try {
      await new Promise<void>((resolve, reject) => {
        el.onloadeddata = () => resolve()
        el.onerror = () => reject(new Error(`media error ${el.error?.code ?? '?'}`))
        setTimeout(() => reject(new Error('timed out loading the blob')), 8000)
        el.load()
      })
      return { ok: true, readyState: el.readyState, error: '' }
    } catch (e) {
      return { ok: false, readyState: el.readyState, error: (e as Error).message }
    } finally {
      URL.revokeObjectURL(url)
    }
  })

  expect(result.ok, `a blob: media source was blocked or failed: ${result.error}`).toBe(true)
  expect(result.readyState).toBeGreaterThanOrEqual(2)

  const v = await violationsOf(page)
  expect(
    v.filter((x) => x.directive.startsWith('media-src')),
    `media-src blocked the generated audio:\n${describeViolations(v)}`,
  ).toEqual([])
})

test('the money and calendar endpoints are reachable from the page — connect-src self', async ({
  page,
}) => {
  await page.goto('/welcome')

  /*
   * The question CSP answers here is whether the browser is ALLOWED to issue
   * these at all. A request blocked by `connect-src` never reaches the network
   * and raises a violation; one that is allowed reaches the server. This server
   * answers 503 not_configured, which is exactly what the deployed handlers
   * return without Stripe/Supabase env — so a 503 is a PASS, and no payment,
   * Stripe object or outbound fetch is involved anywhere.
   */
  const results = await page.evaluate(async () => {
    const call = async (path: string, body: unknown) => {
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        return { path, status: res.status, blocked: false }
      } catch (e) {
        return { path, status: 0, blocked: true, message: (e as Error).message }
      }
    }
    return [
      await call('/api/create-checkout-session', { priceId: 'price_not_real' }),
      await call('/api/calendar-fetch', {}),
    ]
  })

  for (const r of results) {
    expect(r.blocked, `${r.path} was blocked before it left the page`).toBe(false)
    expect(r.status, `${r.path} did not reach the server`).toBeGreaterThan(0)
  }

  const v = await violationsOf(page)
  expect(
    v.filter((x) => x.directive.startsWith('connect-src')),
    `connect-src blocked a same-origin API call:\n${describeViolations(v)}`,
  ).toEqual([])
})

/*
 * ── THE PRERENDER, TESTED WHERE IT ACTUALLY EXISTS ────────────────────────
 *
 * These belong in this file and nowhere else. The main E2E suite drives the
 * Vite dev server, which has no prerendered files at all — it serves the same
 * empty shell for every route, exactly as production used to. This is the only
 * suite that runs against the built `dist/`, behind the real routing rules and
 * the real enforcing policy, so it is the only place that can prove a crawler
 * gets HTML and that the structured data survives `script-src 'self'`.
 */
const MARKETING_ROUTES = ['/welcome', '/pricing', '/about', '/terms', '/privacy']

/** The words a crawler with no JavaScript would read. */
function visibleText(html: string): string {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? ''
  return body
    .replace(/<(script|style|template|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

test('every public route is served as real HTML, with its own title and canonical', async ({
  request,
}) => {
  const seen = new Map<string, string>()

  for (const path of MARKETING_ROUTES) {
    const res = await request.get(path)
    expect(res.ok(), `${path} did not respond`).toBeTruthy()
    const html = await res.text()

    // The regression this whole change exists to prevent: a 200 with an empty
    // body. Before prerendering, EVERY route here returned 0 characters.
    expect(
      visibleText(html).length,
      `${path} served no readable text — the prerender did not run for it`,
    ).toBeGreaterThan(500)

    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
    const canonical = /<link rel="canonical"[^>]*href="([^"]+)"/i.exec(html)?.[1] ?? ''
    expect(title, `${path} has no title`).toBeTruthy()
    expect(canonical, `${path} has no canonical`).toBeTruthy()

    // Every page used to claim the SAME canonical, which told Google they were
    // all duplicates of the homepage. Each must now name its own URL.
    expect(canonical.endsWith(path), `${path} claims to be ${canonical}`).toBe(true)

    // Titles and descriptions must distinguish the pages, not repeat one blurb.
    expect(seen.has(title), `${path} reuses the title already served by ${seen.get(title)}`).toBe(
      false,
    )
    seen.set(title, path)
  }
})

test('the structured data is present, parses, and survives script-src self', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/welcome')).text()
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]) as Record<string, unknown>,
  )
  expect(blocks.length, 'no JSON-LD was injected into /welcome').toBeGreaterThanOrEqual(2)

  const app = blocks.find((b) => b['@type'] === 'SoftwareApplication')
  expect(app, 'no SoftwareApplication block').toBeTruthy()

  /*
   * NOTHING INVENTED. There are no reviews of Todonado, so there is no rating
   * to publish. Fabricating one is a Google structured-data policy violation
   * AND the exact species of claim the marketing surface was audited to remove;
   * this fails the build rather than trusting a future editor to remember.
   */
  for (const forbidden of ['aggregateRating', 'reviewCount', 'review', 'ratingValue']) {
    expect(JSON.stringify(app), `structured data claims ${forbidden}, which is not a known fact`).not.toContain(
      forbidden,
    )
  }

  /*
   * `script-src 'self'` forbids inline SCRIPT. A `type="application/ld+json"`
   * element is a data block: the HTML parser never executes it, so the inline
   * check is never reached. That is the theory — and the point of asserting it
   * here is that the theory is not what ships. The page is loaded under the
   * real enforcing policy and asked whether anything was blocked.
   */
  await page.goto('/welcome')
  await page.waitForLoadState('networkidle')

  const inDom = await page.evaluate(
    () => document.querySelectorAll('script[type="application/ld+json"]').length,
  )
  expect(inDom, 'the JSON-LD was stripped from the DOM under the enforcing policy').toBeGreaterThanOrEqual(2)

  const v = await violationsOf(page)
  expect(
    v.filter((x) => x.directive.startsWith('script-src')),
    `the enforcing policy blocked the structured data:\n${describeViolations(v)}`,
  ).toEqual([])

  /*
   * THE CONTROL, WITHOUT WHICH THE ASSERTION ABOVE PROVES NOTHING.
   *
   * "No violations were reported" has two explanations: the policy allowed the
   * JSON-LD, or the detector is broken and reports nothing either way. So the
   * page is now asked to run a script the policy definitely forbids. If THAT
   * raises no violation, the measurement is faulty and this test fails rather
   * than issuing a clean bill of health it did not earn.
   */
  const control = await page.evaluate(async () => {
    const before = window.__cspViolations.length
    const s = document.createElement('script')
    s.textContent = 'window.__cspControlRan = true'
    document.head.append(s)
    // `securitypolicyviolation` is QUEUED, not dispatched synchronously, so a
    // count read on this same tick is always zero. Writing it that way first is
    // how this control turned out to need a control of its own.
    await new Promise((resolve) => setTimeout(resolve, 250))
    return {
      raised: window.__cspViolations.length - before,
      executed: (window as { __cspControlRan?: boolean }).__cspControlRan === true,
    }
  })
  expect(control.executed, 'an inline script RAN under script-src self').toBe(false)
  expect(
    control.raised,
    'the violation detector reported nothing for a script the policy forbids, so the check above was vacuous',
  ).toBeGreaterThan(0)
})

test('with JavaScript off, the prerendered pages are readable rather than merely present', async ({
  browser,
}) => {
  /*
   * HTML THAT IS PRESENT BUT PAINTED INVISIBLE IS THE WORST OF BOTH WORLDS.
   *
   * A crawler sees hidden text, a reader sees a blank column, and the byte
   * count looks like success. This is not hypothetical: `ProblemSection` builds
   * its list with a setInterval, so on the server the count stayed 0 and all
   * ten task titles were prerendered at `opacity-0` — permanently, since the
   * effect that clears them never runs without JavaScript. It shipped straight
   * past the byte-count checks above.
   *
   * Desktop width on purpose: a responsive `hidden md:block` control is
   * legitimately not rendered on a phone, and asserting at 390px would either
   * fail on that or need an exception list that could hide a real defect.
   */
  const ctx = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 900 },
  })

  try {
    for (const path of ['/welcome', '/pricing']) {
      const page = await ctx.newPage()
      await page.goto(path, { waitUntil: 'load' })
      // CSS entrance animations are allowed to run; only what never resolves
      // without JavaScript should still be invisible after this.
      await page.waitForTimeout(3500)

      const invisible = await page.evaluate(() =>
        Array.from(document.querySelectorAll('h1,h2,h3,p,li,button,a'))
          .filter((el) => {
            if (!(el.textContent || '').trim()) return false
            const s = getComputedStyle(el)
            return s.opacity === '0' || s.visibility === 'hidden' || s.display === 'none'
          })
          .map((el) => `<${el.tagName}> ${(el.textContent || '').trim().slice(0, 60)}`),
      )

      expect(
        invisible,
        `${path} prerenders text that no reader without JavaScript can ever see:\n  ${invisible.join('\n  ')}`,
      ).toEqual([])

      // And the page is genuinely readable, not just free of hidden nodes.
      const readable = await page.evaluate(() =>
        (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
      )
      expect(readable.length, `${path} has almost nothing to read`).toBeGreaterThan(800)
      expect(await page.locator('h1').count(), `${path} has no h1`).toBeGreaterThan(0)

      await page.close()
    }
  } finally {
    await ctx.close()
  }
})

test('the SPA fallback is noindex, and the marketing pages are not', async ({ request }) => {
  /*
   * One HTML file answers every unmatched URL, which is how a router-driven app
   * serves /today and also /a-typo. It used to be index.html, so a nonexistent
   * URL returned 200 wearing the homepage's title and canonical — a soft 404.
   * The fallback now says noindex, and the check that matters is that this did
   * not leak onto the real pages.
   */
  const missing = await request.get('/this-path-does-not-exist-9f2b')
  expect(missing.ok(), 'the SPA fallback must still answer unmatched paths').toBeTruthy()
  const shell = await missing.text()
  expect(shell, 'the fallback must be noindex').toMatch(/<meta name="robots" content="noindex"/)
  expect(shell, 'the fallback must not claim to be any canonical URL').not.toMatch(
    /<link rel="canonical"/,
  )

  for (const path of MARKETING_ROUTES) {
    const html = await (await request.get(path)).text()
    expect(html, `${path} was served the noindex fallback instead of its own page`).not.toMatch(
      /<meta name="robots" content="noindex"/,
    )
  }
})

test('the whole visited surface raised ZERO violations', async ({ page }) => {
  /*
   * The catch-all. Individual tests assert their own directive; this one fails
   * on anything nobody thought to name.
   *
   * Violations are drained AFTER EACH navigation and accumulated here, because
   * addInitScript re-runs on every document and resets the in-page array —
   * reading it once at the end would only ever report the last route, and the
   * test would quietly stop covering the four before it.
   */
  const all: Violation[] = []
  for (const path of ['/welcome', '/pricing', '/login', '/reset-password', '/legal/privacy']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    all.push(...(await violationsOf(page)).map((v) => ({ ...v, blockedURI: `${path} :: ${v.blockedURI}` })))
  }
  expect(all, `the enforcing policy blocked something:\n${describeViolations(all)}`).toEqual([])
})
