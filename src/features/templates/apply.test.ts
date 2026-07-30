import { describe, it, expect } from 'vitest'
import type { NewProjectInput, NewSectionInput, NewTaskInput, Project, Section, Task } from '@/types/database'
import {
  applySuccessMessage,
  applyTargetsFor,
  applyTemplate,
  defaultTargetFor,
  type ApplyDeps,
} from './apply'
import type { Template } from './types'

const template: Template = {
  id: 'test-trip',
  title: 'Trip Packing',
  description: 'Pack for a trip.',
  category: 'travel',
  icon: 'Luggage',
  color: '#4EA8FF',
  tasks: [
    { title: 'Passport & documents', effortMinutes: 10, section: 'Before you go' },
    { title: 'Book transport', effortMinutes: 20, section: 'Before you go', note: 'Confirm times' },
    { title: 'Pack clothes', effortMinutes: 30, section: 'Day of' },
    { title: 'Charge devices', effortMinutes: 5 }, // no section
  ],
}

function makeDeps(opts: { failTaskTitles?: string[] } = {}) {
  const calls = {
    projects: [] as NewProjectInput[],
    sections: [] as NewSectionInput[],
    tasks: [] as NewTaskInput[],
  }
  let pId = 0
  let sId = 0
  let tId = 0
  const deps: ApplyDeps = {
    createProject: async (input) => {
      calls.projects.push(input)
      return { id: `proj-${++pId}`, ...input, color: input.color ?? '#000', status: 'active', created_at: '', updated_at: '' } as Project
    },
    createSection: async (input) => {
      calls.sections.push(input)
      return { id: `sec-${++sId}`, ...input, position: input.position ?? 0, created_at: '', updated_at: '' } as Section
    },
    createTask: async (input) => {
      if (opts.failTaskTitles?.includes(input.title)) throw new Error('boom')
      calls.tasks.push(input)
      return { id: `task-${++tId}`, ...input } as Task
    },
  }
  return { deps, calls }
}

const ctx = { workspaceId: 'ws1', today: '2026-06-22' }

describe('applyTemplate — new project', () => {
  it('creates a project named after the template, sections in order, and every task with its effort', async () => {
    const { deps, calls } = makeDeps()
    const res = await applyTemplate(deps, template, 'project', ctx)

    // one project, named after the template, with its color
    expect(calls.projects).toHaveLength(1)
    expect(calls.projects[0]).toMatchObject({ workspace_id: 'ws1', name: 'Trip Packing', color: '#4EA8FF' })

    // distinct sections, in first-appearance order
    expect(calls.sections.map((s) => s.name)).toEqual(['Before you go', 'Day of'])
    expect(calls.sections.map((s) => s.position)).toEqual([0, 1])

    // every task created with effort + project + correct section mapping
    expect(calls.tasks).toHaveLength(4)
    expect(calls.tasks.map((t) => t.effort_minutes)).toEqual([10, 20, 30, 5])
    expect(calls.tasks.every((t) => t.project_id === 'proj-1')).toBe(true)
    expect(calls.tasks[0].section_id).toBe('sec-1') // Before you go
    expect(calls.tasks[2].section_id).toBe('sec-2') // Day of
    expect(calls.tasks[3].section_id).toBeNull() // no section
    expect(calls.tasks.every((t) => t.scheduled_for === null)).toBe(true)
    expect(calls.tasks.map((t) => t.position)).toEqual([0, 1, 2, 3])
    expect(calls.tasks[1].notes).toBe('Confirm times')

    expect(res).toMatchObject({ target: 'project', taskCount: 4, failedCount: 0, projectId: 'proj-1', destinationLabel: 'Trip Packing' })
  })
})

describe('applyTemplate — today / inbox', () => {
  it('today: schedules every task for today with no project/section', async () => {
    const { deps, calls } = makeDeps()
    const res = await applyTemplate(deps, template, 'today', ctx)
    expect(calls.projects).toHaveLength(0)
    expect(calls.sections).toHaveLength(0)
    expect(calls.tasks).toHaveLength(4)
    expect(calls.tasks.every((t) => t.scheduled_for === '2026-06-22')).toBe(true)
    expect(calls.tasks.every((t) => t.project_id === null && t.section_id === null)).toBe(true)
    expect(res.destinationLabel).toBe('Today')
  })

  it('inbox: creates unscheduled tasks with no project', async () => {
    const { deps, calls } = makeDeps()
    const res = await applyTemplate(deps, template, 'inbox', ctx)
    expect(calls.projects).toHaveLength(0)
    expect(calls.tasks.every((t) => t.scheduled_for === null && t.project_id === null)).toBe(true)
    expect(res.destinationLabel).toBe('Inbox')
  })
})

describe('applyTemplate — partial failure', () => {
  it('counts failed tasks and still reports the successes', async () => {
    const { deps, calls } = makeDeps({ failTaskTitles: ['Pack clothes'] })
    const res = await applyTemplate(deps, template, 'today', ctx)
    expect(res.taskCount).toBe(3)
    expect(res.failedCount).toBe(1)
    expect(calls.tasks).toHaveLength(3)
  })
})

describe('the checklist style', () => {
  const checklist: Template = { ...template, style: 'checklist', title: 'Gym: Push Day' }

  it('offers the dated target to a plan but never to a checklist', () => {
    expect(applyTargetsFor(template)).toEqual(['today', 'project', 'inbox'])
    expect(applyTargetsFor({ ...template, style: 'plan' })).toEqual(['today', 'project', 'inbox'])
    expect(applyTargetsFor(checklist)).toEqual(['project', 'inbox'])
    expect(applyTargetsFor(checklist)).not.toContain('today')
  })

  it('opens a plan on Today and a checklist on the named list', () => {
    expect(defaultTargetFor(template)).toBe('today')
    expect(defaultTargetFor(checklist)).toBe('project')
  })

  it('NORMALISES a dated request away, so the invariant holds for every caller', async () => {
    // Defence in depth: the UI never offers 'today' for a checklist, but if some
    // caller asked for it anyway, the tasks must still land undated — and the
    // reported destination must be the truth, not "Today".
    const { deps, calls } = makeDeps()
    const res = await applyTemplate(deps, checklist, 'today', ctx)
    expect(calls.tasks.every((t) => t.scheduled_for === null)).toBe(true)
    expect(res.target).toBe('inbox')
    expect(res.destinationLabel).toBe('Inbox')
    expect(applySuccessMessage(res)).toBe('Added 4 tasks to Inbox')
  })

  it('still applies a checklist as a project, sections and effort intact', async () => {
    const { deps, calls } = makeDeps()
    const res = await applyTemplate(deps, checklist, 'project', ctx)
    expect(calls.projects[0]).toMatchObject({ name: 'Gym: Push Day' })
    expect(calls.sections.map((s) => s.name)).toEqual(['Before you go', 'Day of'])
    expect(calls.tasks.map((t) => t.effort_minutes)).toEqual([10, 20, 30, 5])
    // A checklist is dateless in EVERY target, not only the normalised one.
    expect(calls.tasks.every((t) => t.scheduled_for === null)).toBe(true)
    expect(res.target).toBe('project')
  })

  it('leaves a PLAN dated exactly as before — no behaviour change', async () => {
    const { deps, calls } = makeDeps()
    const res = await applyTemplate(deps, template, 'today', ctx)
    expect(calls.tasks.every((t) => t.scheduled_for === '2026-06-22')).toBe(true)
    expect(res.target).toBe('today')
  })
})

describe('applySuccessMessage', () => {
  it('formats a clear message and notes failures', () => {
    expect(applySuccessMessage({ target: 'project', taskCount: 14, failedCount: 0, destinationLabel: 'Trip Packing' })).toBe(
      'Added 14 tasks to Trip Packing',
    )
    expect(applySuccessMessage({ target: 'today', taskCount: 1, failedCount: 0, destinationLabel: 'Today' })).toBe(
      'Added 1 task to Today',
    )
    expect(applySuccessMessage({ target: 'inbox', taskCount: 5, failedCount: 2, destinationLabel: 'Inbox' })).toBe(
      "Added 5 tasks to Inbox (2 couldn't be added)",
    )
  })
})
