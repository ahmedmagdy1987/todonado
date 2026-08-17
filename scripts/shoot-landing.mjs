/**
 * Before/after visual proof for the landing compression.
 *
 * Ten chapter shots (six desktop, four mobile) plus a reduced-motion render and
 * a heading-outline dump, written to docs/landing/<label>/.
 *
 *   LABEL=after node scripts/shoot-landing.mjs
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PORT = Number(process.env.PORT || 4322)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = path.resolve('docs/landing', process.env.LABEL || 'after')

function killTree(pid) {
  if (!pid) return
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore' })
    else process.kill(-pid, 'SIGKILL')
  } catch {}
}
async function waitFor(url, t = 90000) {
  const s = Date.now()
  while (Date.now() - s < t) {
    try { const r = await fetch(url); if (r.ok) return } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('server never came up')
}
async function mountAll(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8)
    for (let y = 0; y < document.body.scrollHeight + 2000; y += step) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90))
    }
    window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300))
  })
  await page.waitForTimeout(800)
}

/** Scroll chapter N (1-indexed) to the top of the viewport and shoot it. */
async function shootChapter(page, n, file) {
  await page.evaluate((i) => {
    const el = document.querySelectorAll('main > *')[i - 1]
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8)
  }, n)
  await page.waitForTimeout(600)
  await page.screenshot({ path: file })
}

const server = spawn(
  process.execPath,
  [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'ignore' },
)

try {
  await waitFor(BASE)
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()

  /* ── Desktop 1280 ─────────────────────────────────────────────────────── */
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const d = await dctx.newPage()
  await d.goto(BASE + '/welcome', { waitUntil: 'networkidle' })
  await mountAll(d)

  const DESKTOP = [
    [1, '01-hero'],
    [2, '02-planning'],
    [3, '03-execution-recovery'],
    [4, '04-connected-system'],
    [5, '05-ecosystem'],
    [6, '06-pricing-close'],
  ]
  for (const [n, name] of DESKTOP) {
    await shootChapter(d, n, path.join(OUT, `${name}.png`))
    console.log('shot', name)
  }
  await d.screenshot({ path: path.join(OUT, 'full-1280.png'), fullPage: true })

  // Heading outline — an accessibility regression shows up here first.
  const outline = await d.evaluate(() =>
    Array.from(document.querySelectorAll('main h1, main h2, main h3')).map(
      (h) => `${h.tagName}  ${(h.textContent || '').trim().slice(0, 62)}`,
    ),
  )
  await writeFile(path.join(OUT, 'heading-outline.txt'), outline.join('\n'), 'utf8')
  console.log(`heading outline: ${outline.length} headings`)
  await dctx.close()

  /* ── Mobile 390 ───────────────────────────────────────────────────────── */
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  })
  const m = await mctx.newPage()
  await m.goto(BASE + '/welcome', { waitUntil: 'networkidle' })
  await mountAll(m)

  const MOBILE = [[1, '07-mobile-hero'], [2, '08-mobile-planning'], [4, '09-mobile-system'], [6, '10-mobile-close']]
  for (const [n, name] of MOBILE) {
    await shootChapter(m, n, path.join(OUT, `${name}.png`))
    console.log('shot', name)
  }
  await m.screenshot({ path: path.join(OUT, 'full-390.png'), fullPage: true })
  await mctx.close()

  /* ── Reduced motion still lands on the end state ──────────────────────── */
  const rctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce',
  })
  const r = await rctx.newPage()
  await r.goto(BASE + '/welcome', { waitUntil: 'networkidle' })
  await mountAll(r)
  await r.screenshot({ path: path.join(OUT, 'reduced-motion-390.png'), fullPage: true })
  const hidden = await r.evaluate(() =>
    Array.from(document.querySelectorAll('main [data-shown], main .reveal')).filter(
      (el) => Number(getComputedStyle(el).opacity) < 0.9,
    ).length,
  )
  console.log(`reduced motion: ${hidden} element(s) still under-opacity (want 0)`)
  await writeFile(
    path.join(OUT, 'reduced-motion.txt'),
    `elements below 0.9 opacity under prefers-reduced-motion: ${hidden}\n`,
    'utf8',
  )
  await rctx.close()

  await browser.close()
  console.log('\nwrote', OUT)
} finally {
  killTree(server.pid)
}
