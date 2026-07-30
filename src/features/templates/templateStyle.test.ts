import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import type { UserTemplate } from '@/types/database'
import { personalToTemplate, toTemplateStyle } from './personal'

/**
 * The `style` column and the client's `TemplateStyle` union have to agree, for
 * the same reason the size caps do: if the client could produce a value the DB
 * rejects, saving a template would fail with an opaque `23514`.
 *
 * It also pins the property the whole design rests on — **null means 'plan'** —
 * because that is what lets the column be added with no backfill and lets the
 * app work before the migration is applied.
 *
 * NOTE: this migration is committed but NOT YET APPLIED (CLAUDE.md §7). The test
 * reads the FILE, so it is meaningful before the push.
 */

const MIGRATION = '20260730130000_user_template_style.sql'

const sql = readFileSync(
  fileURLToPath(new URL(`../../../supabase/migrations/${MIGRATION}`, import.meta.url)),
  'utf8',
)

const row = (over: Partial<UserTemplate> = {}): UserTemplate => ({
  id: 'ut-1',
  user_id: 'u-1',
  title: 'Gym: Push Day',
  description: null,
  icon: null,
  color: null,
  style: null,
  tasks: [{ title: 'Bench press', effortMinutes: 15 }],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('the migration', () => {
  it('adds the column additively, so it can be re-run', () => {
    expect(sql).toMatch(/add column if not exists style text/)
  })

  it('is NULLABLE with no default — that is what makes a backfill unnecessary', () => {
    expect(sql).not.toMatch(/style text[^;]*not null/i)
    expect(sql).not.toMatch(/style text[^;]*default/i)
  })

  it('allows exactly the values the client can produce, plus null', () => {
    expect(sql).toMatch(/check \(style is null or style in \('plan', 'checklist'\)\)/)
  })

  it('guards the constraint so a second push is a no-op', () => {
    expect(sql).toMatch(/if not exists \(select 1 from pg_constraint where conname = 'user_templates_style_valid'\)/)
  })

  it('touches no RLS policy — it is a column on an already owner-only table', () => {
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).not.toMatch(/drop policy/i)
    expect(sql).not.toMatch(/enable row level security/i)
  })
})

describe('toTemplateStyle — null means plan', () => {
  it('reads a checklist as a checklist', () => {
    expect(toTemplateStyle('checklist')).toBe('checklist')
  })

  it('reads null, undefined and an explicit plan as a plan', () => {
    expect(toTemplateStyle(null)).toBe('plan')
    expect(toTemplateStyle(undefined)).toBe('plan')
    expect(toTemplateStyle('plan')).toBe('plan')
  })

  it('reads ANYTHING unrecognised as a plan rather than breaking the template', () => {
    // A value from a newer build, or garbage — a saved template must stay usable.
    for (const junk of ['CHECKLIST', 'checklist ', 'kanban', '', 'null', '1']) {
      expect(toTemplateStyle(junk), `"${junk}"`).toBe('plan')
    }
  })
})

describe('personalToTemplate carries the style across the boundary', () => {
  it('marks a stored checklist as one', () => {
    expect(personalToTemplate(row({ style: 'checklist' })).style).toBe('checklist')
  })

  it('leaves the field ABSENT for a plan, so the object is what it always was', () => {
    // Not `style: 'plan'` — absent. That keeps a pre-checklist personal template
    // byte-identical to the object this function produced before the field existed.
    expect(personalToTemplate(row({ style: null })).style).toBeUndefined()
    expect(personalToTemplate(row({ style: 'plan' })).style).toBeUndefined()
    expect('style' in personalToTemplate(row({ style: null }))).toBe(false)
  })

  it('does not let a junk column value produce an invalid Template', () => {
    expect(personalToTemplate(row({ style: 'nonsense' })).style).toBeUndefined()
  })

  it('keeps every other field exactly as before', () => {
    const plain = personalToTemplate(row())
    expect(plain).toEqual({
      id: 'ut-1',
      title: 'Gym: Push Day',
      description: '',
      category: 'personal',
      icon: 'ListChecks',
      tasks: [{ title: 'Bench press', effortMinutes: 15 }],
    })
  })
})
