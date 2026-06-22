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

export interface TemplateTask {
  title: string
  /** Suggested effort in minutes — pre-tagged so the capacity meter is meaningful on apply. */
  effortMinutes: number
  /** Optional group/section heading within the template. */
  section?: string
  /** Optional short helper note. */
  note?: string
}

export interface Template {
  id: string
  title: string
  description: string
  category: TemplateCategoryId
  icon: TemplateIconName
  /** Suggested project color (hex) used when applied as a new project. */
  color?: string
  tasks: TemplateTask[]
}

export interface TemplateCategory {
  id: TemplateCategoryId
  label: string
  icon: TemplateIconName
}
