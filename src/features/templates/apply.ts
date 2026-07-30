import type { NewProjectInput, NewSectionInput, NewTaskInput, Project, Section, Task } from '@/types/database'
import type { Template } from './types'

/** Where a template's tasks land. */
export type ApplyTargetKind = 'project' | 'today' | 'inbox'

/**
 * The creation primitives apply needs — each writes one real row and returns it.
 * In the app these are the same Supabase inserts the task/project/section
 * mutations use (see useApplyTemplate); in tests they're fakes that record calls.
 */
export interface ApplyDeps {
  createProject: (input: NewProjectInput) => Promise<Project>
  createSection: (input: NewSectionInput) => Promise<Section>
  createTask: (input: NewTaskInput) => Promise<Task>
}

export interface ApplyContext {
  workspaceId: string
  /** Today's ISO date (yyyy-MM-dd) for the 'today' target — injected for testability. */
  today: string
}

export interface ApplyResult {
  target: ApplyTargetKind
  /** Tasks successfully created. */
  taskCount: number
  /** Tasks that failed to create (partial failure). */
  failedCount: number
  /** New project id, when applied as a project. */
  projectId?: string
  /** Human destination for the success message, e.g. "Trip Packing", "Today", "Inbox". */
  destinationLabel: string
}

/**
 * The targets a template may be applied to.
 *
 * A checklist is a repeated-use list, so the DATED target is not offered for it:
 * "Tuesday's gym split, scheduled for today" is a plan, not a checklist. The
 * other two targets already produce exactly what a checklist wants — a named
 * list you tick through, or undated capture.
 */
export function applyTargetsFor(template: Template): ApplyTargetKind[] {
  return template.style === 'checklist' ? ['project', 'inbox'] : ['today', 'project', 'inbox']
}

/** The target a template opens on. Today first for plans — it lights up the
 *  capacity meter, which is the first "aha". A checklist opens on the named list. */
export function defaultTargetFor(template: Template): ApplyTargetKind {
  return applyTargetsFor(template)[0]
}

/** Distinct section names in first-appearance order. */
function sectionOrder(template: Template): string[] {
  const order: string[] = []
  for (const t of template.tasks) {
    if (t.section && !order.includes(t.section)) order.push(t.section)
  }
  return order
}

/**
 * Apply a template by creating real rows through the injected primitives. For a
 * 'project' target it creates a project, its sections, then every task (with its
 * pre-tagged effort) under them. For 'today'/'inbox' it creates the tasks
 * directly (today => scheduled_for=today; inbox => unscheduled, no project),
 * flattening sections.
 *
 * Per-task failures are counted and skipped (partial success). A failure to
 * create the project/section is fatal and rejects.
 */
export async function applyTemplate(
  deps: ApplyDeps,
  template: Template,
  requestedTarget: ApplyTargetKind,
  ctx: ApplyContext,
): Promise<ApplyResult> {
  const { workspaceId, today } = ctx

  // A checklist has no dates BY DEFINITION, so the dated target is normalised
  // away here as well as hidden in the UI. Doing it in the pure function means
  // the invariant holds for every caller, and the reported destination stays
  // truthful rather than claiming "Today" for undated tasks.
  const target: ApplyTargetKind =
    template.style === 'checklist' && requestedTarget === 'today' ? 'inbox' : requestedTarget

  let projectId: string | undefined
  let destinationLabel: string
  const sectionIds = new Map<string, string>()

  if (target === 'project') {
    const project = await deps.createProject({
      workspace_id: workspaceId,
      name: template.title,
      color: template.color,
    })
    projectId = project.id
    destinationLabel = template.title

    let pos = 0
    for (const name of sectionOrder(template)) {
      const section = await deps.createSection({ project_id: projectId, name, position: pos++ })
      sectionIds.set(name, section.id)
    }
  } else {
    destinationLabel = target === 'today' ? 'Today' : 'Inbox'
  }

  let taskCount = 0
  let failedCount = 0
  let position = 0
  for (const t of template.tasks) {
    const input: NewTaskInput = {
      workspace_id: workspaceId,
      title: t.title,
      effort_minutes: t.effortMinutes,
      notes: t.note ?? null,
      position: position++,
      project_id: target === 'project' ? (projectId ?? null) : null,
      section_id: target === 'project' && t.section ? (sectionIds.get(t.section) ?? null) : null,
      scheduled_for: target === 'today' ? today : null,
    }
    try {
      await deps.createTask(input)
      taskCount++
    } catch {
      failedCount++
    }
  }

  return { target, taskCount, failedCount, projectId, destinationLabel }
}

/** Clear success copy, e.g. "Added 14 tasks to Trip Packing". */
export function applySuccessMessage(result: ApplyResult): string {
  const n = result.taskCount
  const noun = n === 1 ? 'task' : 'tasks'
  const base = `Added ${n} ${noun} to ${result.destinationLabel}`
  return result.failedCount > 0 ? `${base} (${result.failedCount} couldn't be added)` : base
}
