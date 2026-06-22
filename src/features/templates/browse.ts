import type { Template, TemplateTask } from './types'

/** Filter by category ('all' = no category filter) and a case-insensitive query over title + description. */
export function filterTemplates(templates: Template[], categoryId: string, query: string): Template[] {
  const q = query.trim().toLowerCase()
  return templates.filter((t) => {
    if (categoryId !== 'all' && t.category !== categoryId) return false
    if (!q) return true
    return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  })
}

export interface TaskGroup {
  /** null = ungrouped tasks (no section). */
  section: string | null
  tasks: TemplateTask[]
}

/** Group a template's tasks by section, preserving first-appearance order. */
export function groupTemplateTasks(template: Template): TaskGroup[] {
  const groups: TaskGroup[] = []
  const byKey = new Map<string | null, TaskGroup>()
  for (const task of template.tasks) {
    const key = task.section ?? null
    let group = byKey.get(key)
    if (!group) {
      group = { section: key, tasks: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.tasks.push(task)
  }
  return groups
}
