import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { track } from '@/features/analytics/track'
import { todayISO } from '@/lib/date'
import type { NewProjectInput, NewSectionInput, NewTaskInput, Project, Section, Task } from '@/types/database'
import { applyTemplate, type ApplyResult, type ApplyTargetKind } from './apply'
import type { Template } from './types'

/**
 * Binds template apply to the app's real creation path: the SAME Supabase
 * inserts the project/section/task mutations use (insert -> select -> single),
 * then invalidates the same query keys so Today/Inbox/Projects refresh. Returns
 * an async `apply(template, target)`.
 */
export function useApplyTemplate(workspaceId: string) {
  const qc = useQueryClient()

  const deps = {
    createProject: async (input: NewProjectInput): Promise<Project> => {
      const { data, error } = await supabase.from('projects').insert(input).select('*').single()
      if (error) throw error
      return data as Project
    },
    createSection: async (input: NewSectionInput): Promise<Section> => {
      const { data, error } = await supabase.from('sections').insert(input).select('*').single()
      if (error) throw error
      return data as Section
    },
    createTask: async (input: NewTaskInput): Promise<Task> => {
      const { data, error } = await supabase.from('tasks').insert(input).select('*').single()
      if (error) throw error
      return data as Task
    },
  }

  return async function apply(template: Template, target: ApplyTargetKind): Promise<ApplyResult> {
    const result = await applyTemplate(deps, template, target, { workspaceId, today: todayISO() })
    track('template_applied', { source: typeof target === 'string' ? target : null })
    await qc.invalidateQueries({ queryKey: qk.tasks(workspaceId) })
    if (result.projectId) {
      await qc.invalidateQueries({ queryKey: qk.projects(workspaceId) })
      await qc.invalidateQueries({ queryKey: qk.sections(result.projectId) })
    }
    return result
  }
}
