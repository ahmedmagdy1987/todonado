import { useCallback, useState } from 'react'
import type { PriorityFilter, SortMode } from './sort'

/**
 * Per-view sort + priority-filter preference, remembered in localStorage under
 * the repo's `todonado.<key>` convention. `viewKey` namespaces it per list
 * (e.g. 'today', 'inbox', 'section:<id>'); undefined = ephemeral defaults (no
 * persistence). Defensive against unavailable storage (private mode).
 */
export interface TaskViewPrefs {
  sortMode: SortMode
  priorityFilter: PriorityFilter
}

const DEFAULTS: TaskViewPrefs = { sortMode: 'manual', priorityFilter: 'all' }
const SORT_VALUES: SortMode[] = ['manual', 'priority', 'due', 'effort']

const storageKey = (viewKey: string) => `todonado.taskview.${viewKey}`

function read(viewKey: string | undefined): TaskViewPrefs {
  if (!viewKey) return DEFAULTS
  try {
    const raw = localStorage.getItem(storageKey(viewKey))
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<TaskViewPrefs>
    const sortMode = SORT_VALUES.includes(parsed.sortMode as SortMode)
      ? (parsed.sortMode as SortMode)
      : 'manual'
    const pf = parsed.priorityFilter
    const priorityFilter: PriorityFilter =
      pf === 0 || pf === 1 || pf === 2 || pf === 3 ? pf : 'all'
    return { sortMode, priorityFilter }
  } catch {
    return DEFAULTS
  }
}

function write(viewKey: string | undefined, prefs: TaskViewPrefs): void {
  if (!viewKey) return
  try {
    localStorage.setItem(storageKey(viewKey), JSON.stringify(prefs))
  } catch {
    // storage unavailable — preference stays in-memory for this session
  }
}

export function useTaskViewPrefs(viewKey: string | undefined) {
  const [prefs, setPrefs] = useState<TaskViewPrefs>(() => read(viewKey))

  const setSortMode = useCallback(
    (sortMode: SortMode) =>
      setPrefs((p) => {
        const next = { ...p, sortMode }
        write(viewKey, next)
        return next
      }),
    [viewKey],
  )

  const setPriorityFilter = useCallback(
    (priorityFilter: PriorityFilter) =>
      setPrefs((p) => {
        const next = { ...p, priorityFilter }
        write(viewKey, next)
        return next
      }),
    [viewKey],
  )

  return { ...prefs, setSortMode, setPriorityFilter }
}
