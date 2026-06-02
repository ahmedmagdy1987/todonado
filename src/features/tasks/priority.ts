import type { TaskPriority } from '@/types/database'

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  0: 'None',
  1: 'Low',
  2: 'Medium',
  3: 'High',
}

/** Visual treatment per priority. `dot` empty for "None" (rendered as no badge). */
export const PRIORITY_META: Record<TaskPriority, { label: string; dot: string; text: string }> = {
  0: { label: 'None', dot: '', text: '' },
  1: { label: 'Low', dot: 'bg-accent', text: 'text-accent' },
  2: { label: 'Medium', dot: 'bg-warning', text: 'text-warning' },
  3: { label: 'High', dot: 'bg-danger', text: 'text-danger' },
}
