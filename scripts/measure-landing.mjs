/**
 * Landing-page length + structure measurement.
 *
 * Serves the production build and reports, per viewport: full document height,
 * the number of major conceptual stops (chapters), every section's height, CTA
 * count, and any horizontal overflow.
 *
 *   node scripts/measure-landing.mjs                 # measure only
 *   SHOTS=docs/landing/after node scripts/measure-landing.mjs   # + screenshots
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PORT = Number(process.env.PORT || 4319)
const BASE = `http://127.0.0.1:${PORT}`
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 900 },
]

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

/** Scroll the whole page so lazy sections mount and reveals fire, then settle. */
async function fullyRender(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8)
    for (let y = 0; y < document.body.scrollHeight + 2000; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 90))
    }
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 400))
  })
  await page.waitForTimeout(900)
}

const server = spawn(
  process.execPath,
  [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'ignore' },
)

const report = { generatedAt: new Date().toISOString(), viewports: {} }

try {
  await waitFor(BASE)
  const browser = await chromium.launch()

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.name === '390' ? 2 : 1,
    })
    const page = await ctx.newPage()
    await page.goto(BASE + '/welcome', { waitUntil: 'networkidle' })
    await fullyRender(page)

    const data = await page.evaluate(() => {
      const doc = document.documentElement
      const chapters = Array.from(document.querySelectorAll('main > *')).map((el) => {
        const r = el.getBoundingClientRect()
        return {
          tone: el.getAttribute('data-tone') || el.className.split(' ').slice(0, 2).join(' '),
          height: Math.round(r.height),
        }
      })
      // Per-block heights inside each chapter, so a cut can be argued from
      // pixels rather than taste.
      const blocks = []
      document.querySelectorAll('main > *').forEach((chapter, ci) => {
        Array.from(chapter.children).forEach((child) => {
          const r = child.getBoundingClientRect()
          if (r.height < 40) return
          const h2 = child.querySelector('h2, h3')
          blocks.push({
            chapter: ci + 1,
            label: (h2?.textContent || child.className || '').trim().slice(0, 46),
            height: Math.round(r.height),
          })
        })
      })

      const ctas = Array.from(document.querySelectorAll('main button, main a'))
        .map((el) => (el.textContent || '').trim())
        .filter((t) => /start free|open your command center/i.test(t))
      return {
        docHeight: Math.round(doc.scrollHeight),
        viewportH: window.innerHeight,
        chapters,
        chapterCount: chapters.length,
        ctaCount: ctas.length,
        ctaLabels: ctas,
        overflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth),
        h2Count: document.querySelectorAll('main h2').length,
        blocks,
      }
    })

    report.viewports[vp.name] = data
    console.log(
      `${vp.name}px  height=${data.docHeight}px  chapters=${data.chapterCount}  ` +
      `screens=${(data.docHeight / data.viewportH).toFixed(1)}  CTAs=${data.ctaCount}  ` +
      `h2=${data.h2Count}  overflow=${data.overflowPx}`,
    )
    console.log('       chapters: ' + data.chapters.map((c, i) => `${i + 1}:${c.height}`).join('  '))
    if (vp.name === '390') {
      console.log('       --- blocks at 390 ---')
      data.blocks.forEach((b) => console.log(`       ch${b.chapter}  ${String(b.height).padStart(5)}px  ${b.label}`))
    }

    if (SHOTS) {
      await mkdir(SHOTS, { recursive: true })
      await page.screenshot({ path: path.join(SHOTS, `full-${vp.name}.png`), fullPage: true })
    }
    await ctx.close()
  }

  if (SHOTS) {
    await writeFile(path.join(SHOTS, 'measurements.json'), JSON.stringify(report, null, 2), 'utf8')
  } else {
    await mkdir('docs/landing', { recursive: true })
    await writeFile('docs/landing/measurements-latest.json', JSON.stringify(report, null, 2), 'utf8')
  }

  await browser.close()
} finally {
  killTree(server.pid)
}
