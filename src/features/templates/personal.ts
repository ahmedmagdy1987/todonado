import type {
  Project,
  Section,
  Task,
  UserTemplate,
  UserTemplateTask,
} from '@/types/database'
import { TEMPLATE_ICONS, type TemplateIconName } from './icons'
import type { Template, TemplateTask } from './types'

/**
 * Personal-template logic: capturing a project into a template, adapting a
 * stored row into the catalog's shape, validation, and the Free creation limit.
 * Pure, no React, no I/O — fully unit-tested.
 *
 * The whole design goal is that a personal template becomes an ordinary
 * `Template` at the boundary, so browse, preview, apply, toasts and undo are the
 * EXISTING code paths — there is no second apply implementation to drift.
 */

/** Mirrors the DB CHECKs (see the migration) so the client fails first, and kindly. */
export const MAX_TEMPLATE_TASKS = 100
export const MAX_TEMPLATE_TITLE = 80
export const MAX_TEMPLATE_DESCRIPTION = 280
/** Effort assumed for an unestimated task when capturing a project. */
export const CAPTURE_FALLBACK_EFFORT = 30

const isOpen = (t: Task) => t.status === 'todo' || t.status === 'in_progress'

/** Stable in-list ordering: position, then creation time (the app's convention). */
function byPosition(a: Task, b: Task): number {
  if (a.position !== b.position) return a.position - b.position
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
}

export interface PersonalTemplateDraft {
  title: string
  description: string | null
  icon: string | null
  color: string | null
  tasks: TemplateTask[]
}

function toTemplateTask(task: Task, section?: string): TemplateTask {
  const effort = task.effort_minutes
  return {
    title: task.title,
    // A template's whole value is that it lands effort-tagged, so an unestimated
    // task gets the app's neutral fallback rather than 0 (which would silently
    // make the capacity meter read the applied list as free).
    effortMinutes: effort != null && effort > 0 ? effort : CAPTURE_FALLBACK_EFFORT,
    ...(section ? { section } : {}),
    ...(task.notes ? { note: task.notes } : {}),
  }
}

/**
 * Capture a project's OPEN tasks as a template draft.
 *
 * FIDELITY: section grouping, section order (by `position`), task order within
 * each section, per-task effort and notes are all preserved. Unsectioned tasks
 * come first, matching how the project page itself renders. Completed and
 * cancelled work is excluded — a template is a starting point, not a log.
 *
 * Tasks pointing at a section that wasn't passed in are kept as unsectioned
 * rather than dropped: losing a user's task silently would be far worse than
 * losing its grouping.
 */
export function captureProjectAsTemplate(args: {
  project: Pick<Project, 'name' | 'color'>
  sections: Section[]
  tasks: Task[]
}): PersonalTemplateDraft {
  const { project, sections, tasks } = args
  const open = tasks.filter(isOpen)
  const knownSectionIds = new Set(sections.map((s) => s.id))
  const ordered = [...sections].sort((a, b) => a.position - b.position)

  const out: TemplateTask[] = []
  // Unsectioned first — including orphans whose section is missing.
  open
    .filter((t) => t.section_id == null || !knownSectionIds.has(t.section_id))
    .sort(byPosition)
    .forEach((t) => out.push(toTemplateTask(t)))

  for (const section of ordered) {
    open
      .filter((t) => t.section_id === section.id)
      .sort(byPosition)
      .forEach((t) => out.push(toTemplateTask(t, section.name)))
  }

  return {
    title: project.name.slice(0, MAX_TEMPLATE_TITLE),
    description: null,
    icon: null,
    color: project.color ?? null,
    tasks: out.slice(0, MAX_TEMPLATE_TASKS),
  }
}

/** Is this a name the icon allow-list actually knows? */
export function isTemplateIconName(name: string | null | undefined): name is TemplateIconName {
  return typeof name === 'string' && name in TEMPLATE_ICONS
}

/**
 * Coerce stored jsonb into trustworthy TemplateTasks. The column is jsonb, so
 * treat it as untrusted: drop entries without a usable title and clamp effort to
 * a sane whole number.
 */
export function sanitizeTemplateTasks(raw: unknown): TemplateTask[] {
  if (!Array.isArray(raw)) return []
  const out: TemplateTask[] = []
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue
    const e = entry as Partial<UserTemplateTask>
    const title = typeof e.title === 'string' ? e.title.trim() : ''
    if (!title) continue
    const effortRaw = typeof e.effortMinutes === 'number' ? e.effortMinutes : NaN
    const effortMinutes = Number.isFinite(effortRaw)
      ? Math.min(24 * 60, Math.max(0, Math.round(effortRaw)))
      : CAPTURE_FALLBACK_EFFORT
    out.push({
      title,
      effortMinutes,
      ...(typeof e.section === 'string' && e.section.trim() ? { section: e.section.trim() } : {}),
      ...(typeof e.note === 'string' && e.note.trim() ? { note: e.note.trim() } : {}),
    })
    if (out.length >= MAX_TEMPLATE_TASKS) break
  }
  return out
}

/**
 * Adapt a stored personal template into the catalog's `Template` shape — the
 * single boundary where "personal" stops mattering. Everything downstream
 * (card, search, preview, apply) is the shared code path.
 */
export function personalToTemplate(row: UserTemplate): Template {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    category: 'personal',
    icon: isTemplateIconName(row.icon) ? row.icon : 'ListChecks',
    ...(row.color ? { color: row.color } : {}),
    tasks: sanitizeTemplateTasks(row.tasks),
  }
}

/**
 * May this user create ANOTHER personal template?
 *
 * Note this is only ever asked about CREATION. Existing templates keep working
 * and applying however many there are — the limit never reaches backwards.
 */
export function canCreatePersonalTemplate(
  currentCount: number,
  isPro: boolean,
  limit: number,
): boolean {
  if (isPro) return true
  return currentCount < limit
}

export type ValidationResult = { ok: true } | { ok: false; error: string }

/** Validate a draft before it reaches the database, mirroring the DB CHECKs. */
export function validatePersonalTemplate(draft: PersonalTemplateDraft): ValidationResult {
  const title = draft.title.trim()
  if (!title) return { ok: false, error: 'Give your template a name.' }
  if (title.length > MAX_TEMPLATE_TITLE) {
    return { ok: false, error: `Keep the name under ${MAX_TEMPLATE_TITLE} characters.` }
  }
  if ((draft.description ?? '').length > MAX_TEMPLATE_DESCRIPTION) {
    return { ok: false, error: `Keep the description under ${MAX_TEMPLATE_DESCRIPTION} characters.` }
  }
  const tasks = draft.tasks.filter((t) => t.title.trim().length > 0)
  if (tasks.length === 0) return { ok: false, error: 'Add at least one task.' }
  if (tasks.length > MAX_TEMPLATE_TASKS) {
    return { ok: false, error: `A template can hold up to ${MAX_TEMPLATE_TASKS} tasks.` }
  }
  if (draft.icon != null && !isTemplateIconName(draft.icon)) {
    return { ok: false, error: 'Pick an icon from the list.' }
  }
  return { ok: true }
}

/** The exact rows we persist (drops blank task titles, trims, clamps). */
export function toUserTemplateTasks(tasks: TemplateTask[]): UserTemplateTask[] {
  return sanitizeTemplateTasks(tasks)
}
