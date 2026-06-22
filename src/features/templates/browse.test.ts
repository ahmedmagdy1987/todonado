import { describe, it, expect } from 'vitest'
import type { Template } from './types'
import { filterTemplates, groupTemplateTasks } from './browse'

const t = (over: Partial<Template>): Template => ({
  id: 'x',
  title: 'Title',
  description: 'desc',
  category: 'home',
  icon: 'Home',
  tasks: [{ title: 'a', effortMinutes: 10 }],
  ...over,
})

const sample: Template[] = [
  t({ id: 'a', title: 'Trip Packing', description: 'Pack for a trip', category: 'travel' }),
  t({ id: 'b', title: 'Grocery Run', description: 'Weekly shop', category: 'errands' }),
  t({ id: 'c', title: 'Deep Clean', description: 'Scrub the whole house', category: 'home' }),
  t({ id: 'd', title: 'Road Trip', description: 'Plan a long drive', category: 'travel' }),
]

describe('filterTemplates', () => {
  it("'all' + empty query returns everything", () => {
    expect(filterTemplates(sample, 'all', '')).toHaveLength(4)
  })

  it('filters by category', () => {
    expect(filterTemplates(sample, 'travel', '').map((x) => x.id)).toEqual(['a', 'd'])
  })

  it('searches title and description, case-insensitively', () => {
    expect(filterTemplates(sample, 'all', 'trip').map((x) => x.id)).toEqual(['a', 'd']) // title
    expect(filterTemplates(sample, 'all', 'house').map((x) => x.id)).toEqual(['c']) // description
    expect(filterTemplates(sample, 'all', 'WEEKLY').map((x) => x.id)).toEqual(['b'])
  })

  it('combines category + query', () => {
    expect(filterTemplates(sample, 'travel', 'road').map((x) => x.id)).toEqual(['d'])
    expect(filterTemplates(sample, 'errands', 'trip')).toHaveLength(0)
  })

  it('returns empty when nothing matches', () => {
    expect(filterTemplates(sample, 'all', 'zzzzz')).toHaveLength(0)
  })
})

describe('groupTemplateTasks', () => {
  it('groups by section in first-appearance order, ungrouped under null', () => {
    const tmpl = t({
      tasks: [
        { title: '1', effortMinutes: 5, section: 'Before' },
        { title: '2', effortMinutes: 5, section: 'Before' },
        { title: '3', effortMinutes: 5, section: 'Day of' },
        { title: '4', effortMinutes: 5 },
      ],
    })
    const groups = groupTemplateTasks(tmpl)
    expect(groups.map((g) => g.section)).toEqual(['Before', 'Day of', null])
    expect(groups[0].tasks).toHaveLength(2)
    expect(groups[2].tasks.map((x) => x.title)).toEqual(['4'])
  })

  it('a fully ungrouped template yields a single null group', () => {
    const groups = groupTemplateTasks(t({ tasks: [{ title: 'a', effortMinutes: 1 }] }))
    expect(groups).toHaveLength(1)
    expect(groups[0].section).toBeNull()
  })
})
