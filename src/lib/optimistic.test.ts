import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import {
  assertRealId,
  assertRealIds,
  isOptimisticId,
  newOptimisticId,
  STILL_SAVING_ERROR,
} from './optimistic'

/**
 * The optimistic-id contract, and a sweep that proves it is honoured.
 *
 * ── WHAT THE PREVIOUS VERSION OF THIS FILE GOT WRONG ─────────────────────────
 * It asserted that any file containing `newOptimisticId(` ALSO contained the
 * substring `assertRealId(` somewhere. Every minting hook trivially passed,
 * because every minting hook guards the row it ADDRESSES (`update … eq('id')`).
 * None of them guarded the rows a write REFERENCES, and the test could not tell
 * the difference — so it stayed green while two placeholder ids reached uuid
 * FOREIGN KEYS on other tables:
 *
 *   • `tasks.section_id`   — SectionGroup's QuickAdd, one keystroke after a
 *                            section was created, before its insert returned.
 *   • `subtasks.task_id`   — TaskRow expanding a task created a moment earlier.
 *
 * Worse, the leak lived in `.tsx` components that mint NOTHING, so the sweep —
 * which only ever opened files containing `newOptimisticId(` — never read them.
 *
 * ── WHAT THIS VERSION ASSERTS INSTEAD ────────────────────────────────────────
 *   1. BEHAVIOUR: `assertRealIds` really does refuse a placeholder in any
 *      id-shaped key, tested against the exact payload shapes that shipped
 *      broken. No source reading — real calls, real throws.
 *   2. EVERY WRITE: each `.insert(`/`.upsert(` whose payload can carry an id is
 *      guarded IN THE SAME mutationFn, above the call. An opaque payload
 *      (`.insert(input)`) always requires a guard, because it cannot be read.
 *   3. EVERY READ: each `useQuery` filtering on a FOREIGN KEY to a table whose
 *      primary key can be a placeholder must refuse to run for one — otherwise
 *      it sends `optimistic-…` to a uuid column and gets a 22P02 parse error.
 *   4. The mint registry below is EXACT: a new minting hook, or a hook that
 *      stops minting, fails this file until the registry is updated. That is
 *      what keeps (2) and (3) honest as the schema grows.
 *
 * Sweeps 2–4 read every `.ts` AND `.tsx` under src/, not only files that mint.
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

describe('assertRealIds refuses a placeholder in a FOREIGN KEY, not just in `id`', () => {
  const REAL = '11111111-2222-3333-4444-555555555555'

  it('throws on the two payloads that actually shipped broken', () => {
    // subtasks.task_id — TaskRow → SubtaskList on a task created a moment ago.
    expect(() =>
      assertRealIds({ task_id: newOptimisticId(), title: 'Buy milk', position: 0 }),
    ).toThrow(STILL_SAVING_ERROR)

    // tasks.section_id — SectionGroup's QuickAdd under a brand-new section.
    expect(() =>
      assertRealIds({
        workspace_id: REAL,
        project_id: REAL,
        section_id: newOptimisticId(),
        title: 'Draft the brief',
      }),
    ).toThrow(STILL_SAVING_ERROR)
  })

  it('throws on any id-shaped key, wherever it sits in the payload', () => {
    for (const key of ['id', 'task_id', 'section_id', 'project_id', 'item_id', 'habit_id']) {
      expect(() => assertRealIds({ [key]: newOptimisticId() }), `${key} was not refused`).toThrow(
        STILL_SAVING_ERROR,
      )
    }
  })

  it('passes payloads whose ids are all real', () => {
    expect(() =>
      assertRealIds({ workspace_id: REAL, project_id: REAL, section_id: null, title: 'x' }),
    ).not.toThrow()
  })

  it('is a no-op for payloads with no id-shaped keys', () => {
    expect(() => assertRealIds({ title: 'x', position: 3, done: false })).not.toThrow()
    expect(() => assertRealIds({})).not.toThrow()
  })

  it('does not fire on a key that merely CONTAINS "id"', () => {
    // `is_valid`, `video`, `paid` … must not be mistaken for id columns.
    expect(() => assertRealIds({ paid: newOptimisticId(), video: newOptimisticId() })).not.toThrow()
  })

  it('tolerates null, undefined and non-object input rather than throwing on shape', () => {
    expect(() => assertRealIds(null)).not.toThrow()
    expect(() => assertRealIds(undefined)).not.toThrow()
    expect(() => assertRealIds('not an object')).not.toThrow()
  })

  it('checks every row of a bulk insert, not just the first', () => {
    expect(() => assertRealIds([{ task_id: REAL }, { task_id: newOptimisticId() }])).toThrow(
      STILL_SAVING_ERROR,
    )
  })

  it('ignores non-string id values (a null FK is legal, a number is not an id)', () => {
    expect(() => assertRealIds({ section_id: null, project_id: undefined })).not.toThrow()
  })
})

/* ─────────────────────────── the source sweeps ─────────────────────────── */

const SRC = fileURLToPath(new URL('..', import.meta.url))

/** Every .ts/.tsx under src/ — INCLUDING .tsx components, excluding tests. */
function sourceFiles(): string[] {
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
      if (rel(full) === 'lib/optimistic.ts') continue
      out.push(full)
    }
  }
  walk(SRC)
  return out
}

const rel = (file: string) => file.replace(/\\/g, '/').split('/src/')[1] ?? file

const lineOf = (src: string, index: number) => src.slice(0, index).split('\n').length

/** The text inside the parentheses that open at `openIdx`. */
function balanced(src: string, openIdx: number): string {
  let depth = 0
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') {
      depth--
      if (depth === 0) return src.slice(openIdx + 1, i)
    }
  }
  return src.slice(openIdx + 1)
}

/**
 * WHICH TABLES CAN HAVE A PLACEHOLDER PRIMARY KEY, declared per minting file.
 *
 * Kept by hand ON PURPOSE: the sweeps below need to know which FK columns are
 * dangerous, and that cannot be inferred from the source. The test asserts this
 * registry matches the tree EXACTLY, so adding a minting hook — or removing
 * one — fails here until the consequences are thought through.
 */
const MINTS: Record<string, string[]> = {
  'features/tasks/api/useTaskMutations.ts': ['tasks'],
  'features/tasks/api/useSubtasks.ts': ['subtasks'],
  // NOTE: `features/projects/api/useSections.ts` is deliberately ABSENT — it
  // awaits its insert now, because `tasks.section_id` references it. If it ever
  // reappears here, the QuickAdd under a new section can leak again.
  'features/projects/api/useProjects.ts': ['projects'],
  'features/wellness/tracker/api/useWellnessMutations.ts': ['wellness_items', 'wellness_logs'],
  'features/wellness/quit/api/useQuitMutations.ts': ['quit_checkins'],
}

/**
 * The FK column that points at each of those tables. An empty list means
 * nothing references it, so a placeholder PK there can never leak sideways.
 */
const FK_TO: Record<string, string[]> = {
  tasks: ['task_id'],
  subtasks: [],
  projects: ['project_id'],
  sections: ['section_id'],
  wellness_items: ['item_id'],
  wellness_logs: [],
  quit_checkins: [],
}

const DANGEROUS_FK = new Set(Object.values(MINTS).flat().flatMap((t) => FK_TO[t] ?? []))

describe('the mint registry is exact', () => {
  it('every file that mints a placeholder id is declared, and nothing stale is', () => {
    const minting = sourceFiles()
      .filter((f) => readFileSync(f, 'utf8').includes('newOptimisticId('))
      .map(rel)
      .sort()
    expect(
      minting,
      'MINTS in this file must list exactly the hooks that mint placeholder ids —\n' +
        'a new one needs its table (and that table\'s FK column in FK_TO) thought through;\n' +
        'a hook that now awaits its insert must be removed from the registry.',
    ).toEqual(Object.keys(MINTS).sort())
  })

  it('every minted table has a declared FK column list', () => {
    const undeclared = Object.values(MINTS)
      .flat()
      .filter((t) => !(t in FK_TO))
    expect(undeclared, `add these to FK_TO: ${undeclared.join(', ')}`).toEqual([])
  })
})

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
          offenders.push(`${rel(file)}:${i + 1}`)
        }
      }
    }
    expect(
      offenders,
      `these build or test the prefix themselves instead of using src/lib/optimistic.ts:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('no placeholder id can reach a uuid column', () => {
  it('every insert that can carry an id guards it FIRST, in the same mutationFn', () => {
    const offenders: string[] = []

    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8')
      /*
       * `.update(` AND `.rpc(` ARE IN HERE NOW.
       *
       * The first version modelled only `.insert`/`.upsert`, which is how two
       * real leaks survived a green suite: `updateCard` writes
       * `vision_cards.project_id` through `.update`, and `completeTask` sends a
       * whole spawned task through `.rpc('complete_task', { p_next })`. Both
       * are FK writes; neither was a shape the sweep could see. A guard test
       * that models a subset of the write API is a guard test that reports on
       * the subset.
       */
      const writes = /\.(insert|upsert|update|rpc)\(/g
      let m: RegExpExecArray | null

      while ((m = writes.exec(src))) {
        const open = m.index + m[0].length - 1
        const raw = balanced(src, open).trim()
        // `.rpc('name', payload)` — the payload is the SECOND argument.
        const payload = m[1] === 'rpc' ? raw.slice(raw.indexOf(',') + 1).trim() : raw
        if (m[1] === 'rpc' && !raw.includes(',')) continue // no payload at all

        /*
         * ANYTHING NOT A FULLY-LITERAL OBJECT IS OPAQUE, and must be guarded.
         *
         * This used to test only for a bare identifier, so `.insert({ ...input })`
         * and `.insert(buildRow(x))` both read as "a literal with no id keys"
         * and were skipped. Spread is the single most likely shape for the next
         * hook someone writes.
         */
        // A call expression as a VALUE (`completed_at: new Date()…`) is fine —
        // the KEYS are still visible, which is all this check needs. Only a
        // spread hides keys.
        const literalObject = payload.startsWith('{') && payload.endsWith('}')
        const opaque = !literalObject || /\.\.\./.test(payload)
        const carriesId = /\b(id|[a-z0-9_]+_id)\s*:/.test(payload)
        if (!opaque && !carriesId) continue

        /*
         * The guard must sit above the write and inside the SAME function.
         * `=>` is anchored as well as `function`/`mutationFn`, because
         * `useApplyTemplate` holds three sibling arrow functions each doing its
         * own insert — without it, one sibling's guard satisfied its neighbour
         * and any of the three could lose its own.
         */
        const before = src.slice(0, m.index)
        const scopeStart = Math.max(
          before.lastIndexOf('mutationFn'),
          before.lastIndexOf('function '),
          before.lastIndexOf('=>'),
        )
        const scope = src.slice(scopeStart === -1 ? 0 : scopeStart, m.index)
        if (!/assertRealIds?\s*\(/.test(scope)) {
          offenders.push(
            `${rel(file)}:${lineOf(src, m.index)}  .${m[1]}(${opaque ? payload.slice(0, 40) : '{…}'})`,
          )
        }
      }
    }

    expect(
      offenders,
      'these send a payload to the database without first refusing placeholder ids.\n' +
        'Call `assertRealIds(input)` at the top of the mutationFn — it is a no-op\n' +
        'when the payload holds no ids, and it is the only thing standing between a\n' +
        'half-saved parent row and a 22P02 on its child:\n' +
        offenders.join('\n'),
    ).toEqual([])
  })

  it('every query filtered by a dangerous foreign key refuses to run for a placeholder', () => {
    const offenders: string[] = []

    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8')
      const filters = /\.eq\(\s*['"]([a-z0-9_]+)['"]\s*,\s*([A-Za-z_$][\w$.]*)\s*\)/g
      let m: RegExpExecArray | null

      while ((m = filters.exec(src))) {
        const [, column, value] = m
        if (!DANGEROUS_FK.has(column)) continue

        // Only READS need an `enabled` guard; writes are covered by the sweep
        // above (and by assertRealId on the row they address).
        const before = src.slice(0, m.index)
        const queryStart = before.lastIndexOf('useQuery(')
        const mutationStart = before.lastIndexOf('mutationFn')
        if (queryStart === -1 || mutationStart > queryStart) continue

        const options = balanced(src, queryStart + 'useQuery'.length)
        if (!/isOptimisticId\s*\(/.test(options)) {
          offenders.push(`${rel(file)}:${lineOf(src, m.index)}  .eq('${column}', ${value})`)
        }
      }
    }

    expect(
      offenders,
      'these read a table by a foreign key whose parent id can still be a placeholder.\n' +
        'PostgREST answers `optimistic-…` on a uuid column with a 22P02 PARSE error,\n' +
        "so add `!isOptimisticId(id)` to the query's `enabled`:\n" +
        offenders.join('\n'),
    ).toEqual([])
  })
})
