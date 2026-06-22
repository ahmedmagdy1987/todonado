import { useCallback } from 'react'
import { FEATURES } from '@/lib/config'
import { useFocusSessions } from '@/features/focus/api/useFocusSessions'
import { suggestEffort, type EffortSuggestion } from '../autoEffort'
import { useTasks } from './useTasks'

export type EffortSuggester = (title: string, projectId?: string | null) => EffortSuggestion | null

/**
 * Returns a memoized effort suggester for the workspace, reading the already-
 * cached tasks + focus sessions (no extra fetch beyond what the lists mount).
 * Gated by FEATURES.autoEffort — returns null suggestions when the flag is off,
 * so call sites degrade cleanly with zero history or the feature disabled.
 */
export function useEffortSuggester(workspaceId: string): EffortSuggester {
  const { data: tasks = [] } = useTasks(workspaceId)
  const { data: sessions = [] } = useFocusSessions(workspaceId)
  return useCallback(
    (title: string, projectId?: string | null) =>
      FEATURES.autoEffort ? suggestEffort({ title, projectId: projectId ?? null }, tasks, sessions) : null,
    [tasks, sessions],
  )
}
