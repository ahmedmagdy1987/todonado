import { describe, it, expect } from 'vitest'
import { TEMPLATE_ICONS } from './icons'
import {
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  formatEffort,
  getTemplate,
  templatesByCategory,
  totalEffortMinutes,
} from './catalog'

const categoryIds = new Set(TEMPLATE_CATEGORIES.map((c) => c.id))

describe('catalog integrity', () => {
  it('ships a large catalog (50+) across all 13 categories', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(50)
    expect(TEMPLATE_CATEGORIES).toHaveLength(13)
  })

  it('has globally unique template ids', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every template has a valid category, a resolvable icon, and at least one task', () => {
    for (const t of TEMPLATES) {
      expect(categoryIds.has(t.category)).toBe(true)
      expect(t.icon in TEMPLATE_ICONS).toBe(true)
      expect(t.title.trim().length).toBeGreaterThan(0)
      expect(t.description.trim().length).toBeGreaterThan(0)
      expect(t.tasks.length).toBeGreaterThan(0)
    }
  })

  it('THE differentiator: every task carries a positive effort_minutes', () => {
    for (const t of TEMPLATES) {
      for (const task of t.tasks) {
        expect(Number.isInteger(task.effortMinutes)).toBe(true)
        expect(task.effortMinutes).toBeGreaterThan(0)
        expect(task.title.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('every category has at least one template', () => {
    for (const c of TEMPLATE_CATEGORIES) {
      expect(templatesByCategory(c.id).length).toBeGreaterThan(0)
    }
  })

  it('category icons are resolvable', () => {
    for (const c of TEMPLATE_CATEGORIES) {
      expect(c.icon in TEMPLATE_ICONS).toBe(true)
    }
  })
})

describe('the checklist style', () => {
  const checklists = templatesByCategory('checklists')

  it('ships a real set of them', () => {
    expect(checklists.length).toBeGreaterThanOrEqual(6)
  })

  it('every template in the category IS a checklist', () => {
    // The category and the style are separate fields, so nothing enforces this
    // but a test. A "Routines & Checklists" entry that still offered the dated
    // target would be the exact confusion the style exists to remove.
    for (const t of checklists) {
      expect(t.style, `${t.id} must declare style: 'checklist'`).toBe('checklist')
    }
  })

  it('no template OUTSIDE the category claims to be a checklist', () => {
    for (const t of TEMPLATES) {
      if (t.category === 'checklists') continue
      expect(t.style, `${t.id} should not be a checklist`).not.toBe('checklist')
    }
  })

  it('leaves every other template on the default style, so nothing changed for them', () => {
    const others = TEMPLATES.filter((t) => t.category !== 'checklists')
    for (const t of others) {
      expect(t.style, `${t.id}`).toBeUndefined()
    }
  })

  it('only ever declares a style the type allows', () => {
    for (const t of TEMPLATES) {
      if (t.style !== undefined) expect(['plan', 'checklist']).toContain(t.style)
    }
  })

  it('still carries positive per-task effort — a checklist is not an excuse to skip it', () => {
    for (const t of checklists) {
      expect(totalEffortMinutes(t)).toBeGreaterThan(0)
      for (const task of t.tasks) expect(task.effortMinutes).toBeGreaterThan(0)
    }
  })
})

describe('catalog helpers', () => {
  it('getTemplate / templatesByCategory work', () => {
    const first = TEMPLATES[0]
    expect(getTemplate(first.id)).toBe(first)
    expect(getTemplate('nope-not-real')).toBeUndefined()
    expect(templatesByCategory(first.category)).toContain(first)
  })

  it('totalEffortMinutes sums task efforts', () => {
    const t = TEMPLATES[0]
    const sum = t.tasks.reduce((s, x) => s + x.effortMinutes, 0)
    expect(totalEffortMinutes(t)).toBe(sum)
    expect(totalEffortMinutes(t)).toBeGreaterThan(0)
  })

  it('formatEffort renders human durations', () => {
    expect(formatEffort(45)).toBe('45m')
    expect(formatEffort(60)).toBe('1h')
    expect(formatEffort(150)).toBe('2h 30m')
    expect(formatEffort(0)).toBe('0m')
  })
})
