import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { assertRealId, isOptimisticId, newOptimisticId } from './optimistic'

/**
 * The optimistic-id contract, and a SWEEP that proves it is honoured.
 *
 * This bug class has shipped twice: once as `checkIn` sending a placeholder
 * habit id into `quit_checkins.habit_id` (Postgres 22P02), and once as five
 * hooks minting placeholder ids that other writes then addressed. Both times it
 * was invisible to typecheck, lint and the whole test suite, because a
 * placeholder id is a perfectly good `string`.
 *
 * So the last test here does not test behaviour — it reads the source. That is
 * deliberate: the invariant is "nobody hand-rolls this prefix", and the only way
 * to check that is to look.
 */

describe('the helpers', () => {
  it('mints ids that are recognisably not real', () => {
    const id = newOptimisticId()
    expect(isOptimisticId(id)).toBe(true)
    expect(id.startsWith('optimistic-')).toBe(true)
  })

  it('does not mistake a real uuid for a placeholder', () => {
    expect(isOptimisticId('11111111-2222-3333-4444-555555555555')).toBe(false)
    expect(isOptimisticId('')).toBe(false)
  })

  it('mints a different id every time', () => {
    expect(newOptimisticId()).not.toBe(newOptimisticId())
  })

  it('assertRealId throws on a placeholder and passes a real id', () => {
    expect(() => assertRealId(newOptimisticId())).toThrow()
    expect(() => assertRealId('11111111-2222-3333-4444-555555555555')).not.toThrow()
  })

  it('the error names the situation rather than the mechanism', () => {
    // The user tapped something and it did not happen. "22P02" is not an answer.
    let message = ''
    try {
      assertRealId(newOptimisticId())
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toMatch(/still being saved/i)
    expect(message).not.toMatch(/22P02|uuid|optimistic/i)
  })
})

/** Every .ts/.tsx under src/, excluding this module and test files. */
function sourceFiles(): string[] {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry)) continue
      if (/\.test\.tsx?$/.test(entry)) continue
      if (full.replace(/\\/g, '/').endsWith('src/lib/optimistic.ts')) continue
      out.push(full)
    }
  }
  walk(root)
  return out
}

describe('the prefix lives in exactly one module', () => {
  it('no file hand-rolls an `optimistic-` id or prefix check', () => {
    const offenders: string[] = []
    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8')
      for (const [i, line] of src.split('\n').entries()) {
        // Prose about the pattern is fine; CODE that constructs or tests the
        // prefix is not. Skip comment lines.
        const trimmed = line.trim()
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue
        if (/`optimistic-\$\{/.test(line) || /startsWith\(\s*['"`]optimistic-/.test(line)) {
          offenders.push(`${file.replace(/\\/g, '/').split('/src/')[1]}:${i + 1}`)
        }
      }
    }
    expect(
      offenders,
      `these build or test the prefix themselves instead of using src/lib/optimistic.ts:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('every hook that MINTS a placeholder also guards its other writes', () => {
    // A mint site with no `assertRealId` (or explicit filter) is exactly the
    // shape that shipped broken twice.
    const unguarded: string[] = []
    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8')
      if (!src.includes('newOptimisticId(')) continue
      const guards = src.includes('assertRealId(') || src.includes('isOptimisticId(')
      if (!guards) unguarded.push(file.replace(/\\/g, '/').split('/src/')[1])
    }
    expect(
      unguarded,
      `these mint placeholder ids but never refuse one:\n${unguarded.join('\n')}`,
    ).toEqual([])
  })
})
