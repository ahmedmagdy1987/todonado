#!/usr/bin/env node
/**
 * Serve the PRODUCTION BUILD with the EXACT headers and routing from
 * vercel.json — the enforcing Content-Security-Policy included.
 *
 * ── WHY THIS EXISTS RATHER THAN A VERCEL PREVIEW ──────────────────────────
 *
 * A Vercel Preview deployment does exist for this branch, and testing it would
 * be strictly better. It is not usable from an automated run: the project has
 * Deployment Protection on, so the preview answers `302 -> vercel.com/sso-api`
 * to anything without a Vercel session. Making it reachable means either
 * creating a Protection Bypass secret or turning protection off, and both are
 * changes to the Vercel project, which this iteration is forbidden to make.
 *
 * SO BE CLEAR ABOUT WHAT THIS DOES AND DOES NOT PROVE.
 *
 *   It DOES prove: the policy in vercel.json, applied verbatim and ENFORCING to
 *   the real production bundle, does not block anything the app needs — every
 *   script, style, font, image, media blob, XHR, the service worker and the
 *   manifest — and that the app boots and runs under it. That is the question
 *   the previous suite could not answer, because it drove the Vite dev server
 *   where the same policy is served Report-Only.
 *
 *   It does NOT prove: Vercel's own edge behaviour — header precedence with
 *   platform-injected headers, its exact rewrite engine, compression, or
 *   anything about the deployed serverless functions. Those remain covered only
 *   by the real deployment.
 *
 * ── THE ONE DELIBERATE DEVIATION ──────────────────────────────────────────
 *
 * `connect-src` in the deployed policy hardcodes the PRODUCTION Supabase
 * origin, because that is the origin production talks to. The test stack runs
 * on loopback. `cspRetargetedTo` substitutes the origin and changes nothing
 * else — same directives, same count, same ordering — so the policy under test
 * is as strict as the deployed one. Without it the browser would refuse every
 * API call and the run would be measuring the substitution instead of the app.
 *
 * ── /api/* ────────────────────────────────────────────────────────────────
 *
 * Answered with `503 {"error":"not_configured"}`, which is EXACTLY what the
 * real handlers return when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset
 * (api/create-checkout-session.ts and api/calendar-fetch.ts both check that
 * first, before anything else). The CSP question about these routes is whether
 * the browser is ALLOWED to issue the request at all under `connect-src 'self'`
 * — a blocked request never reaches the network and reports a violation — so a
 * faithful unconfigured response answers it. The handlers' own behaviour is
 * covered by their unit suites.
 *
 * Usage:
 *   VITE_SUPABASE_URL=http://127.0.0.1:54321 node scripts/serve-production-like.mjs
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { productionHeaders, cspRetargetedTo } from './vercelHeaders.js'
import { assertLocalSupabaseUrl } from './supabaseTarget.js'

const ROOT = fileURLToPath(new NodeURL('..', import.meta.url))
const DIST = join(ROOT, 'dist')
const PORT = Number(process.env.CSP_PORT ?? 4178)

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html is missing — run `npm run build` first.')
  process.exit(1)
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
assertLocalSupabaseUrl(supabaseUrl, 'VITE_SUPABASE_URL')

/** vercel.json's catch-all rule, with connect-src retargeted at the local stack. */
const HEADERS = productionHeaders().map(({ key, value }) =>
  key === 'Content-Security-Policy' ? { key, value: cspRetargetedTo(supabaseUrl) } : { key, value },
)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const server = createServer((req, res) => {
  for (const { key, value } of HEADERS) res.setHeader(key, value)

  const pathname = decodeURIComponent(new NodeURL(req.url ?? '/', 'http://x').pathname)

  // vercel.json rewrites everything EXCEPT /api/ to the SPA shell.
  if (pathname.startsWith('/api/')) {
    res.statusCode = 503
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'not_configured' }))
    return
  }

  // No traversal: resolve inside dist or fall through to the shell.
  const rel = normalize(pathname).replace(/^([/\\])+/, '')
  const candidate = join(DIST, rel)
  const isFile = candidate.startsWith(DIST) && existsSync(candidate) && statSync(candidate).isFile()
  const file = isFile ? candidate : join(DIST, 'index.html')

  res.statusCode = 200
  res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
  createReadStream(file).pipe(res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`production-like server on http://127.0.0.1:${PORT}`)
  console.log(`CSP (enforcing): ${HEADERS.find((h) => h.key === 'Content-Security-Policy').value}`)
})
