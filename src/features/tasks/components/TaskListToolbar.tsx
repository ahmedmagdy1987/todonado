import { ArrowDownUp, SlidersHorizontal } from 'lucide-react'
import { Select } from '@/components/ui'
import { SORT_MODES, type PriorityFilter, type SortMode } from '../sort'

const PRIORITY_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All priorities' },
  { value: '3', label: 'High priority' },
  { value: '2', label: 'Medium priority' },
  { value: '1', label: 'Low priority' },
  { value: '0', label: 'No priority' },
]

/**
 * Compact, accessible sort + priority-filter controls for a task view. Native
 * selects (keyboard-friendly) with a leading icon; the selected option text is
 * self-describing ("By priority", "High priority"), so no extra label is needed.
 *
 * EACH CONTROL TAKES HALF THE ROW ON A PHONE. They were fixed at 9rem and 10rem,
 * which cut "Manual order" to "Manual orde" at 390px and pushed the pair into a
 * cramped right-aligned column. `min-w-0` on the wrapper is what actually lets
 * them shrink — the widths go on the wrappers rather than on `<Select>`, which
 * forwards className to the element inside its own relative container.
 */
export function TaskListToolbar({
  sortMode,
  onSortMode,
  priorityFilter,
  onPriorityFilter,
}: {
  sortMode: SortMode
  onSortMode: (mode: SortMode) => void
  priorityFilter: PriorityFilter
  onPriorityFilter: (filter: PriorityFilter) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
        <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
        <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
          <Select
            aria-label="Sort tasks"
            value={sortMode}
            onChange={(e) => onSortMode(e.target.value as SortMode)}
          >
            {SORT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
        <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
          <Select
            aria-label="Filter by priority"
            value={String(priorityFilter)}
            onChange={(e) =>
              onPriorityFilter(
                e.target.value === 'all' ? 'all' : (Number(e.target.value) as PriorityFilter),
              )
            }
          >
            {PRIORITY_FILTERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  )
}
