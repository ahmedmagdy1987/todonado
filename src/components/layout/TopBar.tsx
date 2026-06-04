import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import { LogOut, Plus, Search } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { Button, Modal } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
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
  const { user, signOut } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const initial = (user?.email ?? '?').charAt(0).toUpperCase()

  return (
    <header className="flex h-[4.5rem] shrink-0 items-center gap-2 border-b border-white/5 bg-background/80 px-4 backdrop-blur sm:gap-3 md:px-8">
      <div className="shrink-0 md:hidden">
        <Logo showWordmark={false} />
      </div>

      {/* Title + date: one line that shrinks gracefully — the date truncates
          (ellipsis) and never wraps mid-date; the title itself never clips. */}
      <div className="flex min-w-0 shrink items-baseline gap-2">
        <h1 className="shrink-0 font-display text-lg font-semibold">{title}</h1>
        <span className="hidden truncate text-sm text-text-muted sm:inline">· {today}</span>
      </div>

      {/* Desktop search: flexible width with a min so it never collapses. */}
      <div className="relative hidden min-w-[10rem] max-w-sm flex-1 md:block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <input
          disabled
          placeholder="Search or jump to…  ⌘K"
          aria-label="Search (coming soon)"
          className="focus-ring h-9 w-full rounded-xl border border-white/10 bg-surface-2/40 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted/70 disabled:cursor-not-allowed"
        />
      </div>

      {/* Right cluster — shrink-0 so the actions never overflow or clip. */}
      <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-3">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-surface-2/40 text-text-muted transition-colors hover:text-text-primary md:hidden"
        >
          <Search className="h-4 w-4" aria-hidden />
        </button>
        {/* Mobile account: avatar opens a profile sheet (email + Log out).
            Desktop keeps the account + sign-out in the sidebar. */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label="Account"
          aria-haspopup="dialog"
          className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white md:hidden"
        >
          {initial}
        </button>
        {/* Desktop add-task button; on mobile this lives in the floating FAB. */}
        <Button
          size="sm"
          onClick={onAddTask}
          disabled={!onAddTask}
          title="New task"
          className="hidden md:inline-flex"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add task
        </Button>
      </div>

      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Search">
        <div className="space-y-3 p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <input
              autoFocus
              disabled
              placeholder="Search or jump to…"
              aria-label="Search (coming soon)"
              className="focus-ring h-11 w-full rounded-xl border border-white/10 bg-surface-2/40 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted/70 disabled:cursor-not-allowed"
            />
          </div>
          <p className="text-xs text-text-muted">Jump-to-anything search is coming soon.</p>
        </div>
      </Modal>

      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="Account">
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-surface-2/40 px-3 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{user?.email ?? 'Guest'}</p>
              <p className="text-xs text-text-muted">Signed in</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setProfileOpen(false)
              void signOut()
            }}
            className="focus-ring flex w-full items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-left text-sm font-medium text-text-muted transition-colors hover:bg-surface-2/60 hover:text-danger"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
            Log out
          </button>
        </div>
      </Modal>
    </header>
  )
}
