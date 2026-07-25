import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * REGRESSION GUARD for the production outage where every billing endpoint
 * returned a bare 500 (`FUNCTION_INVOCATION_FAILED`) on EVERY request.
 *
 * Cause: package.json is `"type": "module"`, so these files run as ESM on
 * Vercel's Node runtime. Node's ESM resolver does no extension guessing, so an
 * extensionless relative import (`./_lib/config`) throws ERR_MODULE_NOT_FOUND
 * at MODULE LOAD — before the handler exists, so no try/catch inside the
 * handler can ever catch it.
 *
 * tsconfig.api.json (moduleResolution NodeNext) already makes this a compile
 * error; this test states the rule explicitly so the reason survives even if
 * someone relaxes the tsconfig.
 */
const apiDir = dirname(fileURLToPath(import.meta.url))

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return tsFiles(full)
    return entry.endsWith('.ts') ? [full] : []
  })
}

const RELATIVE_IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"](\.[^'"]*)['"]/g

describe('api/ ESM import contract', () => {
  const files = tsFiles(apiDir)

  it('finds the handler sources', () => {
    expect(files.length).toBeGreaterThanOrEqual(4)
  })

  it.each(files.map((f) => [f.slice(apiDir.length + 1).replace(/\\/g, '/'), f]))(
    '%s uses explicit .js extensions on every relative import',
    (_name, full) => {
      const src = readFileSync(full, 'utf8')
      const offenders: string[] = []
      for (const m of src.matchAll(RELATIVE_IMPORT)) {
        if (!m[1].endsWith('.js')) offenders.push(m[1])
      }
      expect(
        offenders,
        `extensionless relative import(s) ${JSON.stringify(offenders)} — these throw ` +
          `ERR_MODULE_NOT_FOUND at module load under "type":"module" and take the ` +
          `whole endpoint down with FUNCTION_INVOCATION_FAILED. Add the .js extension.`,
      ).toEqual([])
    },
  )
})
