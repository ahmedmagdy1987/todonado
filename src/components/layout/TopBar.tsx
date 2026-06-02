import { useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import { Plus, Search } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui'
import { NAV_ITEMS } from './nav'

function usePageTitle(): string {
  const { pathname } = useLocation()
  const match = NAV_ITEMS.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  )
  return match?.label ?? 'Todonado'
}

export function TopBar({ onAddTask }: { onAddTask?: () => void }) {
  const title = usePageTitle()
  const today = format(new Date(), 'EEEE, MMM d')

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/5 bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="md:hidden">
        <Logo showWordmark={false} />
      </div>
      <h1 className="font-display text-lg font-semibold">{title}</h1>
      <span className="hidden text-sm text-text-muted sm:inline">· {today}</span>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <input
            disabled
            placeholder="Search or jump to…  ⌘K"
            aria-label="Search (coming soon)"
            className="focus-ring h-9 w-64 rounded-xl border border-white/10 bg-surface-2/40 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted/70 disabled:cursor-not-allowed"
          />
        </div>
        <Button size="sm" onClick={onAddTask} disabled={!onAddTask} title="New task">
          <Plus className="h-4 w-4" aria-hidden />
          Add task
        </Button>
      </div>
    </header>
  )
}
