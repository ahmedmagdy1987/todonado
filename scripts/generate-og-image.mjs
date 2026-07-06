/**
 * Generates public/og-image.png (1200x630) — the social share card.
 *
 * Renders an on-brand HTML card (design tokens from tailwind.config.js / CLAUDE.md
 * §2) with headless chromium and screenshots it, so the asset is a real raster PNG
 * (Facebook/X/WhatsApp don't reliably render SVG og:images). Re-run after a brand
 * change:  node scripts/generate-og-image.mjs
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const logo = readFileSync(join(root, 'public/icons/icon-192.png')).toString('base64')

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  .card {
    position: relative; width: 1200px; height: 630px; overflow: hidden;
    background: #0A0D16; color: #F8FAFC;
    font-family: Inter, system-ui, sans-serif;
  }
  .glow {
    position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(60% 55% at 50% -8%, rgba(108,92,231,0.30) 0%, rgba(78,168,255,0.12) 38%, transparent 72%);
  }
  .edge { position: absolute; left: 0; top: 0; height: 100%; width: 8px; background: linear-gradient(180deg,#6C5CE7,#4EA8FF); }
  .content { position: relative; z-index: 1; height: 100%; padding: 72px 80px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .mark { width: 60px; height: 60px; border-radius: 14px; }
  .wordmark { font-family: Poppins, sans-serif; font-weight: 800; font-size: 34px; letter-spacing: -0.5px; }
  .grad { background: linear-gradient(135deg,#6C5CE7,#4EA8FF); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .badge {
    margin-left: auto; font-size: 18px; font-weight: 600; color: #4EA8FF;
    border: 1px solid rgba(78,168,255,0.35); background: rgba(78,168,255,0.08);
    padding: 8px 16px; border-radius: 999px;
  }
  .headline { font-family: Poppins, sans-serif; font-weight: 800; font-size: 78px; line-height: 1.04; letter-spacing: -1.5px; margin-top: auto; }
  .sub { font-size: 27px; line-height: 1.4; color: #94A3B8; max-width: 860px; margin-top: 26px; }
  .meter { width: 480px; height: 14px; border-radius: 999px; background: #1E293B; overflow: hidden; margin-top: 40px; }
  .fill { height: 100%; width: 72%; border-radius: 999px; background: linear-gradient(90deg,#6C5CE7,#4EA8FF); }
  .foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; font-size: 21px; color: #94A3B8; }
  .foot .url { color: #F8FAFC; font-weight: 600; }
</style>
</head>
<body>
  <div class="card">
    <div class="glow"></div>
    <div class="edge"></div>
    <div class="content">
      <div class="brand">
        <img class="mark" src="data:image/png;base64,${logo}" />
        <span class="wordmark">Todo<span class="grad">nado</span></span>
        <span class="badge">Effort-aware planning</span>
      </div>
      <h1 class="headline">Plan a realistic day.<br /><span class="grad">Not a wish-list.</span></h1>
      <p class="sub">Your daily command center. Tag each task with the effort it takes, and a live capacity meter shows what actually fits.</p>
      <div class="meter"><div class="fill"></div></div>
      <div class="foot">
        <span>Capture · Plan · Focus · Recover</span>
        <span class="url">www.todonado.com</span>
      </div>
    </div>
  </div>
</body>
</html>`

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(root, 'public/og-image.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } })
  console.log('Wrote public/og-image.png (1200x630)')
} finally {
  await browser.close()
}
