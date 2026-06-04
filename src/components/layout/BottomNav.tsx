import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LogOut, MoreHorizontal, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Modal } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { NAV_ITEMS } from './nav'
import { cn } from '@/lib/utils'

/**
 * Mobile primary navigation. The sidebar is desktop-only (`md:flex`); below the
 * `md` breakpoint we surface a fixed bottom bar instead: the four main
 * destinations as icons flanking a prominent center "+" (quick add-task), plus a
 * "More" sheet that keeps Insights, the account, and Log out reachable.
 *
 * Insights moves into "More" so the four wedge destinations (Today, Inbox,
 * Projects, Focus) stay one tap away.
 */
const PRIMARY = NAV_ITEMS.filter((item) => item.to !== '/insights')
const MORE_ITEMS = NAV_ITEMS.filter((item) => item.to === '/insights')

const tabBase =
  'focus-ring flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors'

function TabLink({ to, label, icon: Icon, end }: { to: string; label: string; icon: LucideIcon; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(tabBase, isActive ? 'text-brand' : 'text-text-muted')}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span className="max-w-full truncate">{label}</span>
    </NavLink>
  )
}

export function BottomNav({ onAddTask }: { onAddTask: () => void }) {
  const { user, signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const initial = (user?.email ?? '?').charAt(0).toUpperCase()

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/5 bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="flex flex-1 items-stretch justify-around">
          {PRIMARY.slice(0, 2).map((item) => (
            <TabLink key={item.to} {...item} />
          ))}
        </div>

        {/* Prominent center add-task action (mirrors the desktop top-bar button). */}
        <div className="flex shrink-0 items-start justify-center px-2">
          <button
            type="button"
            onClick={onAddTask}
            aria-label="Add task"
            className="focus-ring -mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-brand-glow ring-4 ring-background transition-transform active:scale-95"
          >
            <Plus className="h-6 w-6" aria-hidden />
          </button>
        </div>

        <div className="flex flex-1 items-stretch justify-around">
          {PRIMARY.slice(2).map((item) => (
            <TabLink key={item.to} {...item} />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            className={cn(tabBase, 'text-text-muted')}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
            <span className="max-w-full truncate">More</span>
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="space-y-1 p-3">
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface-2/40 px-3 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{user?.email ?? 'Guest'}</p>
              <p className="text-xs text-text-muted">Signed in</p>
            </div>
          </div>

          {MORE_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-gradient-soft text-text-primary'
                    : 'text-text-muted hover:bg-surface-2/60 hover:text-text-primary',
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              {label}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => {
              setMoreOpen(false)
              void signOut()
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-text-muted transition-colors hover:bg-surface-2/60 hover:text-danger"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
            Log out
          </button>
        </div>
      </Modal>
    </>
  )
}
