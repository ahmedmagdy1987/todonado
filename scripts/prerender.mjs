/**
 * Write a real HTML file for every public marketing route.
 *
 * ── THE PROBLEM ────────────────────────────────────────────────────────────
 *
 * Before this, every public URL served the same `index.html`: a 3,438-byte
 * document whose body was `<div id="root"></div>`. Measured on live production,
 * every route returned ZERO characters of body text, the same title, the same
 * description, and the same canonical pointing at the homepage. A crawler that
 * does not execute the bundle learned nothing about the product, and the shared
 * canonical actively told Google that /pricing, /about, /terms and /privacy were
 * duplicates of /.
 *
 * ── HOW THIS WORKS ─────────────────────────────────────────────────────────
 *
 *   1. `vite build`            the normal client build, untouched
 *   2. `vite build --ssr`      the same app compiled for Node, entry-server.tsx
 *   3. this script             render each public route, splice it into the
 *                              built index.html, write dist/<route>/index.html
 *
 * Output is plain static files. Vercel serves them directly, so there is no
 * server to run, no cold start and no request-time work.
 *
 * ── WHY NOT A HEADLESS BROWSER ─────────────────────────────────────────────
 *
 * Playwright is already a devDependency and driving the built site with it
 * would have been the shorter path. It was rejected because the browser is not
 * present in Vercel's build image: every deploy would have to download Chromium
 * before it could produce HTML, which is a slow, large and fragile dependency
 * sitting directly in the path of shipping anything. Rendering with React in
 * Node needs nothing that `npm ci` does not already install.
 */
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const SSR_OUT = path.join(ROOT, '.prerender')

const ok = (m) => console.log(`  ✓ ${m}`)

async function main() {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('dist/index.html not found. Run `vite build` before prerendering.')
  }

  /*
   * This step reads dist/index.html as its template and also OVERWRITES it with
   * the render of `/`. Run twice without a fresh `vite build` in between and the
   * template is already filled, so the injection silently has nothing to do.
   * Say so plainly instead of failing later with a confusing message about a
   * missing div.
   */
  if (!(await readFile(path.join(DIST, 'index.html'), 'utf8')).includes('<div id="root"></div>')) {
    throw new Error(
      'dist/index.html has already been prerendered. Run `vite build` first — `npm run build` does both in order.',
    )
  }

  console.log('\nPrerender: compiling the SSR bundle')
  await build({
    logLevel: 'warn',
    /*
     * `configFile: false` — the SSR build does NOT inherit vite.config.ts.
     *
     * That config exists to shape a browser bundle: it manual-chunks react,
     * supabase and react-query into vendor files, registers the PWA service
     * worker plugin, and mounts the api/* dev middleware. An SSR build treats
     * those same packages as external, so Rollup refuses the manual chunks
     * outright, and a service worker has no meaning in Node.
     *
     * Inheriting and then unpicking each setting would leave this script
     * quietly coupled to every future change in the client config. Declaring
     * the two things it genuinely needs — JSX, and the `@/` alias — is both
     * smaller and more honest about what a build-time render depends on.
     */
    configFile: false,
    plugins: [react()],
    resolve: { alias: { '@': path.join(ROOT, 'src') } },
    build: {
      ssr: path.join(ROOT, 'src/prerender/entry-server.tsx'),
      outDir: SSR_OUT,
      emptyOutDir: true,
      // Node reads it; no need to spend time minifying a build-time artefact.
      minify: false,
      rollupOptions: {
        output: {
          format: 'esm',
          entryFileNames: 'entry-server.mjs',
          /*
           * The client build splits vendors into manual chunks (react-vendor,
           * supabase, query, browse). An SSR build treats those same packages
           * as EXTERNAL, and Rollup refuses to put an external module into a
           * manual chunk. Clearing the split is correct rather than a
           * workaround: chunking exists to shape what a browser downloads, and
           * nothing here is downloaded by anyone.
           */
          manualChunks: undefined,
        },
      },
    },
  })
  ok('SSR bundle built')

  // One module, one import: the entry re-exports the route table, so the data
  // and the tree that renders it can never come from different builds.
  const { renderRoute, PRERENDER_ROUTES, softwareApplicationJsonLd, organizationJsonLd } =
    await import(pathToFileURL(path.join(SSR_OUT, 'entry-server.mjs')).href)

  const template = await readFile(path.join(DIST, 'index.html'), 'utf8')
  console.log('\nPrerender: rendering routes')

  for (const route of PRERENDER_ROUTES) {
    const appHtml = await renderRoute(route.path)

    let html = template

    // ── head: per-route, replacing the homepage defaults ──────────────────
    html = replaceTag(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(route.title)}</title>`)
    html = replaceAttr(html, 'name="description"', route.description)
    html = replaceTag(
      html,
      /<link rel="canonical"[^>]*>/,
      `<link rel="canonical" href="${route.canonical}" />`,
    )
    html = replaceAttr(html, 'property="og:title"', route.title)
    html = replaceAttr(html, 'property="og:description"', route.description)
    html = replaceAttr(html, 'property="og:url"', route.canonical)
    html = replaceAttr(html, 'name="twitter:title"', route.title)
    html = replaceAttr(html, 'name="twitter:description"', route.description)

    if (route.softwareApplicationLd) {
      const ld =
        `\n    <script type="application/ld+json">${softwareApplicationJsonLd()}</script>` +
        `\n    <script type="application/ld+json">${organizationJsonLd()}</script>`
      html = html.replace('</head>', `${ld}\n  </head>`)
    }

    // ── body: the rendered app, in place of the empty root ────────────────
    const before = html
    html = html.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
    if (html === before) {
      throw new Error('Could not find <div id="root"></div> in dist/index.html to inject into.')
    }

    /*
     * BOTH `<route>.html` AND `<route>/index.html`, deliberately.
     *
     * Vercel resolves a clean URL like /pricing from either file, and which one
     * it prefers is a platform detail this build should not be betting on. If
     * the lookup misses, the catch-all rewrite silently serves the SPA shell
     * instead and the page is invisible to crawlers again: the exact failure
     * being fixed, reintroduced by a filename. Writing both costs a few
     * kilobytes and removes the bet.
     */
    if (route.path === '/') {
      await writeFile(path.join(DIST, 'index.html'), html, 'utf8')
    } else {
      const slug = route.path.slice(1)
      await mkdir(path.join(DIST, slug), { recursive: true })
      await writeFile(path.join(DIST, slug, 'index.html'), html, 'utf8')
      await writeFile(path.join(DIST, `${slug}.html`), html, 'utf8')
    }

    /*
     * THE CONTRACT IS CHECKED HERE, WHERE IT CAN STOP A DEPLOY.
     *
     * The bug this whole change fixes was a page that answered 200 with an
     * empty body. Nothing in typecheck, lint or the unit suite can see that,
     * and a regression would look identical to success. So the assertion sits
     * in the build: if a route ever renders less text than it promises, or
     * loses a phrase it must carry, the build fails and Vercel ships nothing.
     */
    const text = visibleText(appHtml)
    if (route.minText && text.length < route.minText) {
      throw new Error(
        `Prerender: ${route.path} rendered only ${text.length} chars of visible text, ` +
          `below its declared minimum of ${route.minText}. The page is likely empty or a ` +
          `lazy section failed to resolve.`,
      )
    }
    for (const needle of route.mustContain ?? []) {
      if (!text.includes(needle)) {
        throw new Error(`Prerender: ${route.path} is missing required copy: ${JSON.stringify(needle)}`)
      }
    }

    ok(
      `${route.path.padEnd(10)} ${String(html.length).padStart(7)} bytes  ${String(text.length).padStart(6)} chars of text`,
    )
  }

  /*
   * THE SPA FALLBACK GETS ITS OWN FILE, AND IT IS `noindex`.
   *
   * `vercel.json` rewrites every unmatched path to a single HTML file, which is
   * how a React Router app serves /today, /login and also /any-typo-at-all.
   * That file used to be `index.html`, which meant it was three things at once:
   * the root page, the app shell, and the 404 handler. A request for a URL that
   * does not exist returned 200 carrying the homepage's title and canonical,
   * which is a soft 404 and exactly what search engines ask sites not to serve.
   *
   * Splitting it out lets the fallback say `noindex` without that also applying
   * to `/`. App routes are already Disallowed in robots.txt; this covers the
   * typos, the stale inbound links, and anything added to the router later by
   * someone who has never read this file.
   */
  const shell = template
    .replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>')
    .replace(
      /<link rel="canonical"[^>]*>/,
      '<!-- No canonical: this shell answers many URLs and is none of them. -->',
    )
  await writeFile(path.join(DIST, 'app.html'), shell, 'utf8')
  ok('app.html   SPA fallback, noindex, no canonical')

  await rm(SSR_OUT, { recursive: true, force: true })
  console.log('\nPrerender: done\n')
}

/** Replace a whole tag, or fail loudly. A silent miss ships a stale head. */
function replaceTag(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`Prerender: no match for ${pattern} in index.html`)
  return html.replace(pattern, replacement)
}

/** Replace the `content` of a meta tag identified by one of its attributes. */
function replaceAttr(html, identifier, content) {
  const pattern = new RegExp(`(<meta[^>]*${escapeRe(identifier)}[^>]*content=")[^"]*(")`, 'i')
  if (!pattern.test(html)) throw new Error(`Prerender: no meta matching ${identifier}`)
  return html.replace(pattern, `$1${esc(content)}$2`)
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The words a crawler with no JavaScript would actually read. */
function visibleText(html) {
  return html
    .replace(/<(script|style|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

main().catch((err) => {
  console.error('\nPrerender FAILED:', err)
  process.exit(1)
})
