import { NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { useAuth } from '@/features/auth/auth-context'
import { NAV_ITEMS } from './nav'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const { user, signOut } = useAuth()
  const initial = (user?.email ?? '?').charAt(0).toUpperCase()

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-surface/50 md:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-gradient-soft text-text-primary'
                  : 'text-text-muted hover:bg-surface-2/60 hover:text-text-primary',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    'h-[18px] w-[18px] transition-colors',
                    isActive ? 'text-brand' : 'text-text-muted group-hover:text-text-primary',
                  )}
                  aria-hidden
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">
              {user?.email ?? 'Guest'}
            </p>
            <p className="text-xs text-text-muted">Phase 0 · Foundation</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            title="Sign out"
            aria-label="Sign out"
            className="focus-ring rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-2/60 hover:text-danger"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  )
}
