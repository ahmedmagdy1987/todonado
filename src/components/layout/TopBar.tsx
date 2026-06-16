import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import { LogOut, Plus } from 'lucide-react'
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

      {/* Right cluster: ml-auto pushes the primary action to the far right so the
          title sits left and the action sits right, with clean whitespace between
          (standard app-header layout). shrink-0 so the actions never clip. */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
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
