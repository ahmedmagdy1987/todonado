/**
 * A local stand-in for the parts of `e2e/marketing.spec.ts` that this change can
 * break.
 *
 * The real suite needs a local Supabase stack (Docker), which is not available
 * on every machine; CI runs it on every push. These are the assertions that the
 * homepage compression could actually violate, checked against the real
 * production build so a regression is caught before the push rather than after.
 *
 *   node scripts/check-landing-contract.mjs
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import path from 'node:path'

const PORT = Number(process.env.PORT || 4321)
const BASE = `http://127.0.0.1:${PORT}`

function killTree(pid) {
  if (!pid) return
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore' })
    else process.kill(-pid, 'SIGKILL')
  } catch {}
}

async function waitFor(url, timeout = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try { const r = await fetch(url); if (r.ok) return } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`server never came up at ${url}`)
}

const failures = []
const ok = (label) => console.log(`  ok    ${label}`)
const fail = (label, detail) => { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }

/** Scroll so every lazily-mounted section renders. */
async function mountAll(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8)
    for (let y = 0; y < document.body.scrollHeight + 2000; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 90))
    }
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 300))
  })
  await page.waitForTimeout(800)
}

/** Every capability the app actually ships. None may read as unbuilt. */
const SHIPPED = [
  'Mind maps', 'Journal', 'Challenges', 'Sleep sounds',
  'Breathwork', 'Quit tracker', 'Week planning', 'Insights',
]

/** Permanently cancelled. Must appear on no public page. */
const CANCELLED = ['AI coach', 'AI review', 'AI suggestions', 'natural-language capture', 'text-to-speech']

const server = spawn(
  process.execPath,
  [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'ignore' },
)

try {
  await waitFor(BASE)
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()

  /* ── /welcome ─────────────────────────────────────────────────────────── */
  console.log('\n/welcome')
  await page.goto(BASE + '/welcome', { waitUntil: 'networkidle' })
  await mountAll(page)

  const strip = page.getByRole('region', { name: /One place for your day/i })
  ;(await strip.count()) === 1 ? ok('breadth region present') : fail('breadth region present', `count=${await strip.count()}`)

  for (const group of ['Plan', 'Focus', 'Habits', 'Calm', 'Reflect']) {
    const h = strip.getByRole('heading', { name: group, level: 3 })
    ;(await h.count()) > 0 ? ok(`breadth group: ${group}`) : fail(`breadth group: ${group}`)
  }
  for (const label of ['Mind maps', 'Journal', 'Challenges']) {
    const t = strip.getByText(label, { exact: true })
    ;(await t.count()) > 0 ? ok(`everything-else names: ${label}`) : fail(`everything-else names: ${label}`)
  }
  const everything = strip.getByRole('heading', { name: /Everything else/i })
  ;(await everything.count()) > 0 ? ok('"Everything else" heading present') : fail('"Everything else" heading present')

  const stripText = (await strip.textContent()) ?? ''
  const UNBUILT = /coming soon|not built|not switched on|notify me|not yet|we.ll let you know/i
  if (UNBUILT.test(stripText)) fail('nothing unbuilt advertised in the breadth region')
  else ok('nothing unbuilt advertised in the breadth region')

  const pageText = ((await page.locator('main').textContent()) ?? '').toLowerCase()
  for (const feature of SHIPPED) {
    const near = new RegExp(`${feature}[^.]{0,60}(coming soon|not built|not switched on)`, 'i')
    near.test(pageText) ? fail(`shipped feature labelled unbuilt: ${feature}`) : ok(`not labelled unbuilt: ${feature}`)
  }
  for (const phrase of CANCELLED) {
    pageText.includes(phrase.toLowerCase()) ? fail(`cancelled capability mentioned: ${phrase}`) : ok(`no mention: ${phrase}`)
  }

  // The week board still runs the real planner. It is lazy and animates, so this
  // waits the way e2e/marketing.spec.ts does rather than sampling once.
  try {
    const board = page.getByRole('button', { name: 'Plan my week' })
    await board.scrollIntoViewIfNeeded()
    const columns = await page.getByRole('img', { name: /% of the day planned$/ }).count()
    if (columns !== 7) fail('week board shows 7 per-day capacities', `found ${columns}`)
    else ok('week board shows 7 per-day capacities')
    await board.click()
    await page.getByText(/\d+ planned · \d+ left for later/).first()
      .waitFor({ state: 'visible', timeout: 15000 })
    await page.getByText(/earliest day with room/i).first().waitFor({ state: 'visible', timeout: 5000 })
    ok('week board runs the real planner')
  } catch (e) {
    fail('week board runs the real planner', String(e).slice(0, 90))
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)

  // The compressed FAQ: exactly three, plus the link to the rest.
  const faqRegion = page.locator('section[aria-labelledby="faq"]')
  const qCount = await faqRegion.locator('details').count()
  qCount === 3 ? ok('homepage FAQ has 3 questions') : fail('homepage FAQ has 3 questions', `found ${qCount}`)
  const seeAll = faqRegion.getByRole('link', { name: /See all pricing questions/i })
  ;(await seeAll.count()) === 1 ? ok('links to the full pricing FAQ') : fail('links to the full pricing FAQ')

  // EXACTLY ONE fake door. e2e/marketing.spec.ts pins this at 1, and it is what
  // makes removing the wellness teaser a CI failure rather than a saving: the
  // guided-meditation card is the landing's only ANONYMOUS demand capture, and a
  // signed-in surface cannot measure interest from people who never sign up.
  const comingSoon = await page.getByText('Coming soon', { exact: true }).count()
  if (comingSoon === 1) ok('exactly one fake door on the landing')
  else fail('exactly one fake door on the landing', `found ${comingSoon}`)

  const h1 = await page.getByRole('heading', { level: 1 }).count()
  h1 === 1 ? ok('exactly one h1') : fail('exactly one h1', `found ${h1}`)

  /* ── /pricing ─────────────────────────────────────────────────────────── */
  console.log('\n/pricing')
  await page.goto(BASE + '/pricing', { waitUntil: 'networkidle' })
  await mountAll(page)

  const pFaq = page.locator('#faq')
  ;(await pFaq.count()) === 1 ? ok('pricing FAQ anchor present') : fail('pricing FAQ anchor present')
  const pCount = await pFaq.locator('details').count()
  pCount === 6 ? ok('pricing FAQ carries the full set (6)') : fail('pricing FAQ carries the full set (6)', `found ${pCount}`)

  const pricingText = ((await page.locator('main').textContent()) ?? '').toLowerCase()
  for (const phrase of ['does it work on my phone', 'is my data private']) {
    pricingText.includes(phrase) ? ok(`moved answer still public: "${phrase}"`) : fail(`moved answer still public: "${phrase}"`)
  }
  for (const phrase of CANCELLED) {
    pricingText.includes(phrase.toLowerCase()) ? fail(`cancelled capability on /pricing: ${phrase}`) : ok(`no mention on /pricing: ${phrase}`)
  }

  await browser.close()
} finally {
  killTree(server.pid)
}

console.log(`\n${failures.length === 0 ? 'ALL CONTRACT CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`}`)
if (failures.length) {
  failures.forEach((f) => console.error('  - ' + f))
  process.exitCode = 1
}
