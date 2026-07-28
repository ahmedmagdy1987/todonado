import { describe, expect, it } from 'vitest'
import { makeTask } from '@/test/factories'
import type { Project, Section, UserTemplate } from '@/types/database'
import { applyTemplate, type ApplyDeps } from './apply'
import {
  CAPTURE_FALLBACK_EFFORT,
  MAX_TEMPLATE_TASKS,
  MAX_TEMPLATE_TITLE,
  canCreatePersonalTemplate,
  captureProjectAsTemplate,
  isTemplateIconName,
  personalToTemplate,
  sanitizeTemplateTasks,
  validatePersonalTemplate,
  type PersonalTemplateDraft,
} from './personal'

const project = (over: Partial<Project> = {}): Project => ({
  id: 'proj-1',
  workspace_id: 'ws-1',
  name: 'Client onboarding',
  color: '#6C5CE7',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

const section = (id: string, name: string, position: number): Section => ({
  id,
  project_id: 'proj-1',
  name,
  position,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
})

const row = (over: Partial<UserTemplate> = {}): UserTemplate => ({
  id: 'ut-1',
  user_id: 'u-1',
  title: 'Monday routine',
  description: 'How I start the week',
  icon: 'Rocket',
  color: '#4EA8FF',
  tasks: [{ title: 'Inbox zero', effortMinutes: 30 }],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('captureProjectAsTemplate — fidelity', () => {
  it('preserves section grouping, section order and task order', () => {
    const draft = captureProjectAsTemplate({
      project: project(),
      // Deliberately out of order — section `position` decides.
      sections: [section('s2', 'Week one', 2), section('s1', 'Kickoff', 1)],
      tasks: [
        makeTask({ id: 'b', title: 'Send welcome pack', section_id: 's1', position: 1, effort_minutes: 15 }),
        makeTask({ id: 'a', title: 'Schedule kickoff call', section_id: 's1', position: 0, effort_minutes: 30 }),
        makeTask({ id: 'c', title: 'First check-in', section_id: 's2', position: 0, effort_minutes: 45 }),
        makeTask({ id: 'z', title: 'Collect brand assets', section_id: null, position: 0, effort_minutes: 20 }),
      ],
    })

    expect(draft.tasks.map((t) => [t.title, t.section])).toEqual([
      ['Collect brand assets', undefined], // unsectioned first, as the project page renders
      ['Schedule kickoff call', 'Kickoff'],
      ['Send welcome pack', 'Kickoff'],
      ['First check-in', 'Week one'],
    ])
  })

  it('preserves per-task effort and notes', () => {
    const draft = captureProjectAsTemplate({
      project: project(),
      sections: [],
      tasks: [makeTask({ title: 'Draft the SOW', effort_minutes: 90, notes: 'Use the 2026 rate card' })],
    })
    expect(draft.tasks[0]).toEqual({
      title: 'Draft the SOW',
      effortMinutes: 90,
      note: 'Use the 2026 rate card',
    })
  })

  it('gives an unestimated task the neutral fallback, never 0', () => {
    // 0 would make the applied list read as free capacity — the opposite of the point.
    const draft = captureProjectAsTemplate({
      project: project(),
      sections: [],
      tasks: [makeTask({ effort_minutes: null }), makeTask({ effort_minutes: 0 })],
    })
    expect(draft.tasks.map((t) => t.effortMinutes)).toEqual([
      CAPTURE_FALLBACK_EFFORT,
      CAPTURE_FALLBACK_EFFORT,
    ])
  })

  it('captures OPEN work only — a template is a starting point, not a log', () => {
    const draft = captureProjectAsTemplate({
      project: project(),
      sections: [],
      tasks: [
        makeTask({ title: 'todo', status: 'todo' }),
        makeTask({ title: 'doing', status: 'in_progress' }),
        makeTask({ title: 'done', status: 'done' }),
        makeTask({ title: 'cancelled', status: 'cancelled' }),
      ],
    })
    expect(draft.tasks.map((t) => t.title)).toEqual(['todo', 'doing'])
  })

  it('keeps a task whose section is missing rather than dropping it', () => {
    const draft = captureProjectAsTemplate({
      project: project(),
      sections: [], // the section row wasn't loaded
      tasks: [makeTask({ title: 'Orphan', section_id: 'ghost' })],
    })
    expect(draft.tasks.map((t) => [t.title, t.section])).toEqual([['Orphan', undefined]])
  })

  it('carries the project name and colour, and truncates an over-long name', () => {
    const draft = captureProjectAsTemplate({
      project: project({ name: 'x'.repeat(200), color: '#22D3A6' }),
      sections: [],
      tasks: [makeTask()],
    })
    expect(draft.title).toHaveLength(MAX_TEMPLATE_TITLE)
    expect(draft.color).toBe('#22D3A6')
  })

  it('caps a huge project at the task limit', () => {
    const tasks = Array.from({ length: 150 }, (_, i) => makeTask({ id: `t${i}`, position: i }))
    const draft = captureProjectAsTemplate({ project: project(), sections: [], tasks })
    expect(draft.tasks).toHaveLength(MAX_TEMPLATE_TASKS)
  })

  it('handles an empty project', () => {
    expect(captureProjectAsTemplate({ project: project(), sections: [], tasks: [] }).tasks).toEqual([])
  })
})

describe('personalToTemplate — the adaptation boundary', () => {
  it('becomes an ordinary Template in the "personal" category', () => {
    const t = personalToTemplate(row())
    expect(t.id).toBe('ut-1')
    expect(t.category).toBe('personal')
    expect(t.title).toBe('Monday routine')
    expect(t.description).toBe('How I start the week')
    expect(t.icon).toBe('Rocket')
    expect(t.color).toBe('#4EA8FF')
  })

  it('falls back to a safe icon for an unknown or missing name', () => {
    expect(personalToTemplate(row({ icon: 'NotARealIcon' })).icon).toBe('ListChecks')
    expect(personalToTemplate(row({ icon: null })).icon).toBe('ListChecks')
  })

  it('normalises a null description and omits a null colour', () => {
    const t = personalToTemplate(row({ description: null, color: null }))
    expect(t.description).toBe('')
    expect(t.color).toBeUndefined()
  })
})

describe('sanitizeTemplateTasks — jsonb is untrusted', () => {
  it('drops entries with no usable title', () => {
    const tasks = sanitizeTemplateTasks([
      { title: 'keep', effortMinutes: 30 },
      { title: '   ', effortMinutes: 30 },
      { effortMinutes: 30 },
      null,
      'nope',
      42,
    ])
    expect(tasks.map((t) => t.title)).toEqual(['keep'])
  })

  it('repairs a missing or nonsensical effort', () => {
    const tasks = sanitizeTemplateTasks([
      { title: 'a' },
      { title: 'b', effortMinutes: -5 },
      { title: 'c', effortMinutes: 99999 },
      { title: 'd', effortMinutes: 30.6 },
    ])
    expect(tasks.map((t) => t.effortMinutes)).toEqual([CAPTURE_FALLBACK_EFFORT, 0, 1440, 31])
  })

  it('trims section and note, omitting blanks', () => {
    const [t] = sanitizeTemplateTasks([
      { title: 'a', effortMinutes: 10, section: '  Kickoff ', note: '   ' },
    ])
    expect(t.section).toBe('Kickoff')
    expect(t.note).toBeUndefined()
  })

  it('caps the list and tolerates a non-array', () => {
    expect(
      sanitizeTemplateTasks(Array.from({ length: 200 }, (_, i) => ({ title: `t${i}`, effortMinutes: 5 }))),
    ).toHaveLength(MAX_TEMPLATE_TASKS)
    expect(sanitizeTemplateTasks(null)).toEqual([])
    expect(sanitizeTemplateTasks({ title: 'x' })).toEqual([])
  })
})

describe('canCreatePersonalTemplate — the limit gates CREATION only', () => {
  it.each([
    [0, true],
    [2, true],
    [3, false],
    [9, false],
  ])('Free with %i existing → %s', (count, allowed) => {
    expect(canCreatePersonalTemplate(count, false, 3)).toBe(allowed)
  })

  it('is unlimited for Pro, at any count', () => {
    expect(canCreatePersonalTemplate(3, true, 3)).toBe(true)
    expect(canCreatePersonalTemplate(500, true, 3)).toBe(true)
  })
})

describe('validatePersonalTemplate', () => {
  const draft = (over: Partial<PersonalTemplateDraft> = {}): PersonalTemplateDraft => ({
    title: 'Shipping prep',
    description: null,
    icon: null,
    color: null,
    tasks: [{ title: 'Tag the release', effortMinutes: 15 }],
    ...over,
  })

  it('accepts a good draft', () => {
    expect(validatePersonalTemplate(draft())).toEqual({ ok: true })
  })

  it.each([
    [{ title: '   ' }, /name/i],
    [{ title: 'x'.repeat(MAX_TEMPLATE_TITLE + 1) }, /under/i],
    [{ description: 'x'.repeat(500) }, /description/i],
    [{ tasks: [] }, /at least one task/i],
    [{ tasks: [{ title: '  ', effortMinutes: 5 }] }, /at least one task/i],
    [{ icon: 'Nope' }, /icon/i],
  ])('rejects %o', (over, message) => {
    const result = validatePersonalTemplate(draft(over as Partial<PersonalTemplateDraft>))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(message)
  })

  it('rejects more tasks than the cap', () => {
    const tasks = Array.from({ length: MAX_TEMPLATE_TASKS + 1 }, (_, i) => ({
      title: `t${i}`,
      effortMinutes: 5,
    }))
    expect(validatePersonalTemplate(draft({ tasks })).ok).toBe(false)
  })
})

describe('isTemplateIconName', () => {
  it('accepts allow-listed names only', () => {
    expect(isTemplateIconName('Rocket')).toBe(true)
    expect(isTemplateIconName('Nope')).toBe(false)
    expect(isTemplateIconName(null)).toBe(false)
  })
})

describe('a personal template applies through the EXISTING apply path', () => {
  it('produces the same result shape as any catalog template', async () => {
    const created: { projects: number; sections: string[]; tasks: string[] } = {
      projects: 0,
      sections: [],
      tasks: [],
    }
    const deps: ApplyDeps = {
      createProject: async () => {
        created.projects += 1
        return { id: 'new-proj' } as never
      },
      createSection: async (input) => {
        created.sections.push(input.name)
        return { id: `sec-${created.sections.length}` } as never
      },
      createTask: async (input) => {
        created.tasks.push(input.title)
        return { id: `task-${created.tasks.length}` } as never
      },
    }

    const template = personalToTemplate(
      row({
        title: 'Client onboarding',
        tasks: [
          { title: 'Collect assets', effortMinutes: 20 },
          { title: 'Kickoff call', effortMinutes: 30, section: 'Kickoff' },
        ],
      }),
    )

    const result = await applyTemplate(deps, template, 'project', {
      workspaceId: 'ws-1',
      today: '2026-06-23',
    })

    expect(result).toMatchObject({
      target: 'project',
      taskCount: 2,
      failedCount: 0,
      destinationLabel: 'Client onboarding',
    })
    expect(created.sections).toEqual(['Kickoff'])
    expect(created.tasks).toEqual(['Collect assets', 'Kickoff call'])
  })
})
