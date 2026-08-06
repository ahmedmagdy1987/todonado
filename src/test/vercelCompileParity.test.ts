import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/**
 * THE GUARD THAT KEEPS THE GUARD.
 *
 * `npm run typecheck` compiles api/ under tsconfig.api.json, which sets
 * `lib: ["ES2023"]` with no DOM. Vercel compiles the SAME files against the
 * root tsconfig.json, which carries no compilerOptions at all, so the DOM lib
 * is included. Two different lib sets over one set of files.
 *
 * That gap shipped a broken production build: commit 1304b36 fixed
 * `api/_lib/nodeAdapter.ts(73,74) TS2322 — Buffer<ArrayBufferLike> is not
 * assignable to BodyInit`, which passed every CI job and failed on Vercel.
 * Proven again while adding this: restoring the pre-fix file makes `tsc -b`
 * exit 0 and `tsc -p tsconfig.api.vercel.json` exit 2 with that exact error.
 *
 * These tests exist because the parity check is worth nothing if someone can
 * delete it, drop DOM from it, or add an api/ entry point it never sees.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/**
 * Parse JSONC, stripping comments ONLY outside string literals.
 *
 * A naive `/\/\*[\s\S]*?\*\//g` cannot be used here: the include glob
 * `api/**\/*.ts` contains `/**\/`, so a regex stripper silently rewrites it to
 * `api*.ts` and every assertion about coverage becomes a lie. Character-level,
 * string-aware, like the scanner in noLongDashes.test.ts.
 */
function parseJsonc<T>(source: string): T {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (inString) {
      out += c
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      continue
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 1
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i)
      i = end === -1 ? source.length : end - 1
      continue
    }
    out += c
  }
  return JSON.parse(out)
}

/**
 * Only the fields these assertions actually read.
 *
 * `compilerOptions` is REQUIRED rather than optional: both configs have one,
 * and a config that lost it should fail this suite loudly rather than make
 * every assertion below silently optional-chain into `undefined`.
 */
interface TsConfigLike {
  extends?: string
  include?: string[]
  compilerOptions: { lib?: string[]; include?: string[] } & Record<string, unknown>
}
interface PackageLike {
  scripts: Record<string, string>
}

const json = <T,>(rel: string): T => parseJsonc<T>(read(rel))

const apiConfig = json<TsConfigLike>('../../tsconfig.api.json')
const vercelConfig = json<TsConfigLike>('../../tsconfig.api.vercel.json')
const pkg = json<PackageLike>('../../package.json')
const workflow = read('../../.github/workflows/ci.yml')

describe('the Vercel compilation context is reproduced in CI', () => {
  it('the parity config exists and INCLUDES the DOM lib', () => {
    // DOM is the whole point: it is what Vercel's default lib set pulls in.
    expect(vercelConfig.compilerOptions.lib).toContain('DOM')
  })

  it('it EXTENDS the API config rather than restating it', () => {
    /*
     * One source of truth, two contexts. If it duplicated `include` or the
     * strictness flags, a new api/ file or a new rule would land in one and not
     * the other, and the parity check would quietly stop being parity.
     */
    expect(vercelConfig.extends).toBe('./tsconfig.api.json')
    expect(vercelConfig.compilerOptions.include).toBeUndefined()
    expect(vercelConfig.include).toBeUndefined()
  })

  it('overrides ONLY lib (plus its own build-info path)', () => {
    const overridden = Object.keys(vercelConfig.compilerOptions).sort()
    expect(overridden).toEqual(['lib', 'tsBuildInfoFile'])
  })

  it('the base config still excludes DOM, so both contexts are really checked', () => {
    // If someone "fixes" a future error by adding DOM to the base config, the
    // two contexts collapse into one and this check stops meaning anything.
    expect(apiConfig.compilerOptions.lib).not.toContain('DOM')
    expect(apiConfig.include).toContain('api/**/*.ts')
  })

  it('every api/ entry point is covered by the inherited include', () => {
    // `api/**/*.ts` is a glob, so a new entry point is covered automatically.
    // Asserting the glob (rather than a file list) is what makes that true.
    expect(apiConfig.include).toContain('api/**/*.ts')
  })

  it('is wired to an npm script AND run in CI', () => {
    expect(pkg.scripts['typecheck:vercel']).toBe('tsc -p tsconfig.api.vercel.json')
    expect(workflow).toContain('npm run typecheck:vercel')
  })

  it('runs in the same job as the ordinary typecheck', () => {
    // A separate optional job would be easy to ignore; this must gate the same
    // way `npm run typecheck` does.
    const verifyJob = workflow.slice(workflow.indexOf('  verify:'), workflow.indexOf('  e2e:'))
    expect(verifyJob).toContain('npm run typecheck:vercel')
  })
})
