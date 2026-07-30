import type { TemplateIconName } from './icons'

export type TemplateCategoryId =
  | 'daily'
  | 'work'
  | 'home'
  | 'errands'
  | 'travel'
  | 'events'
  | 'health'
  | 'finance'
  | 'growth'
  | 'students'
  | 'beginnings'
  | 'seasonal'
  /**
   * Repeated-use lists that are ticked through rather than planned into a day —
   * a gym split, a packing list, a weekly shutdown. Every template in here
   * carries `style: 'checklist'`.
   */
  | 'checklists'
  /**
   * A user's OWN saved template. Deliberately absent from TEMPLATE_CATEGORIES,
   * so it never renders as a browse chip — personal templates get their own
   * "My templates" section — while still flowing through the shared
   * Template type, card, preview and apply path.
   */
  | 'personal'

export interface TemplateTask {
  title: string
  /** Suggested effort in minutes — pre-tagged so the capacity meter is meaningful on apply. */
  effortMinutes: number
  /** Optional group/section heading within the template. */
  section?: string
  /** Optional short helper note. */
  note?: string
}

/**
 * How a template is meant to be USED, which is the only thing that separates a
 * checklist from a plan:
 *
 *  'plan'      — a set of tasks you schedule into a day. The default, and what
 *                every template was before checklists existed.
 *  'checklist' — a repeated-use list you tick through: a gym split, a packing
 *                list, a weekly shutdown. It applies WITHOUT dates, so the
 *                dated ("Today") target is not offered for it.
 *
 * The field is OPTIONAL and absent means 'plan', so every existing template,
 * every stored personal row and every test fixture stays valid untouched.
 */
export type TemplateStyle = 'plan' | 'checklist'

export interface Template {
  id: string
  title: string
  description: string
  category: TemplateCategoryId
  icon: TemplateIconName
  /** Suggested project color (hex) used when applied as a new project. */
  color?: string
  /** Absent = 'plan'. See TemplateStyle. */
  style?: TemplateStyle
  tasks: TemplateTask[]
}

export interface TemplateCategory {
  id: TemplateCategoryId
  label: string
  icon: TemplateIconName
}
