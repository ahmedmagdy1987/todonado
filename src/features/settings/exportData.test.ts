import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXCLUDED, EXPORTED_TABLES } from './exportData'

/**
 * "Export my data" has to keep meaning ALL of it.
 *
 * The export drifted from six tables to six-of-twenty-two without a single
 * failing test, because nothing tied the exporter to the schema. This reads the
 * migrations and fails the moment a new table is neither exported nor
 * deliberately excluded — the day the migration lands, not the day a user
 * deletes their account and discovers their journal was never in the file.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')

function tablesInMigrations(): string[] {
  const names = new Set<string>()
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_]+)/gi)) {
      names.add(m[1].toLowerCase())
    }
  }
  return [...names].sort()
}

describe('the data export covers the schema', () => {
  it('finds the migrations (guards against a silently empty sweep)', () => {
    expect(tablesInMigrations().length).toBeGreaterThan(15)
  })

  it('exports or explicitly excludes EVERY table the migrations create', () => {
    const accounted = new Set([...EXPORTED_TABLES, ...Object.keys(EXCLUDED)])
    const missing = tablesInMigrations().filter((t) => !accounted.has(t))
    expect(
      missing,
      `These tables are in the schema but not in the export manifest. Add them to ` +
        `EXPORTED_TABLES, or to EXCLUDED with a reason a user would accept: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('never claims to export a table that does not exist', () => {
    const real = new Set(tablesInMigrations())
    expect(EXPORTED_TABLES.filter((t) => !real.has(t))).toEqual([])
  })

  it('every exclusion carries a reason, not an empty string', () => {
    for (const [table, reason] of Object.entries(EXCLUDED)) {
      expect(reason.length, `${table} is excluded with no reason given`).toBeGreaterThan(20)
    }
  })

  it('exports the tables that hold the most personal content', () => {
    // The ones whose loss would be unrecoverable and most keenly felt.
    for (const table of [
      'journal_entries',
      'quit_habits',
      'quit_checkins',
      'wellness_items',
      'wellness_logs',
      'vision_cards',
      'mind_maps',
      'user_challenges',
      'user_templates',
      'subtasks',
    ]) {
      expect(EXPORTED_TABLES, `${table} must be in the export`).toContain(table)
    }
  })
})
